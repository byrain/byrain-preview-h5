/* ==== Chrome gate ==== */
(function () {
    const ua = navigator.userAgent;
    const isChrome = !!window.showDirectoryPicker && /Chrome\/\d+/.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua);
    if (!isChrome) {
        document.body.innerHTML = '<div style="max-width:760px;margin:48px auto;font:16px/1.6 system-ui;padding:0 16px;">'
            + '<h2>需要使用 Chrome 浏览器</h2>'
            + '<p>本工具依赖 <code>File System Access API</code>，请使用最新版 Chrome 打开。</p>'
            + '</div>';
    }
})();

/* ==== utils ==== */
const randHex = (n = 32) => Array.from(crypto.getRandomValues(new Uint8Array(n / 2))).map(b => b.toString(16).padStart(2, '0')).join('');
const toUS = s => Math.round(s * 1e6);
const pad2 = n => String(n).padStart(2, '0');
const tsNow = () => { const d = new Date(); return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()); };
const asPlainString = v => (v == null) ? '' : (Array.isArray(v) ? v.join('') : String(v));

/* ==== IndexedDB ==== */
const DB = 'fs-handles', STORE = 'handles', HANDLE_KEY = 'jy.dir.handle';
function idbOpen() { return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => { r.result.createObjectStore(STORE) }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbSet(k, v) { const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function idbGet(k) { const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readonly'); const req = tx.objectStore(STORE).get(k); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }

/* ==== FS helpers ==== */
async function ensureDir(parent, name) { return await parent.getDirectoryHandle(name, { create: true }); }
async function writeFile(dir, name, data) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    try { const payload = (data instanceof Blob) ? data : new Blob([data]); await w.write(payload); } finally { await w.close(); }
}
async function verifyPermission(handle, write) {
    const opts = { mode: write ? 'readwrite' : 'read' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if ((await handle.requestPermission(opts)) === 'granted') return true;
    return false;
}

/* ==== decode (HMAC + base64url) ==== */
const enc = new TextEncoder(), dec = new TextDecoder();
function b64urlToBytes(b64url) { let s = b64url.replace(/-/g, '+').replace(/_/g, '/'); const pad = s.length % 4 ? 4 - (s.length % 4) : 0; s += '='.repeat(pad); const bin = atob(s); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++)arr[i] = bin.charCodeAt(i); return arr; }
function bytesToHex(buf) { const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf); return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join(''); }
async function hmacSha256Hex(keyStr, dataBytes) { const key = await crypto.subtle.importKey('raw', enc.encode(keyStr), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const sig = await crypto.subtle.sign('HMAC', key, dataBytes); return bytesToHex(new Uint8Array(sig)); }
async function secureDecode(encoded_str, secret) {
    const combined = b64urlToBytes(encoded_str);
    let dot = -1; for (let i = 0; i < combined.length; i++) { if (combined[i] === 46) { dot = i; break; } }
    if (dot < 0) throw new Error('编码格式不正确：找不到分隔点');
    const sigPart = combined.slice(0, dot), jsonPart = combined.slice(dot + 1);
    const expectedHex = await hmacSha256Hex(secret, jsonPart);
    const sigHex = dec.decode(sigPart);
    if (sigHex !== expectedHex) throw new Error('签名验证失败');
    const jsonText = dec.decode(jsonPart);
    return JSON.parse(jsonText);
}

/* ==== caption extraction ==== */
function extractCaptions(decoded) {
    // 可能是数组，也可能是 JSON 字符串；优先 cap_list，回退 list
    const raw = decoded?.cap_list ?? decoded?.list ?? [];
    let arr;
    if (typeof raw === 'string') {
        try { arr = JSON.parse(raw); } catch { arr = []; }
    } else {
        arr = Array.isArray(raw) ? raw : [];
    }
    if (!arr.length) return [];

    // 依次尝试 cap / caption / text
    let caps = arr.map(it => asPlainString(it?.cap ?? it?.caption ?? it?.text ?? '').trim());

    // 轻度规范化
    return caps.map(t => t
        .replace(/\r\n/g, ' ')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
    );
}

/* ==== 字幕切割（避免引号内断句 + 短尾修正） ==== */
function chunkByChars(text, maxChars = 14) {
    const SEP_RE = /[，。！？；：、,\.!\?;:\s]|…{1,2}|—{1,2}/; // 软断点
    const TAIL_2_RE = /(起来|下来|上去|进去|出来|回来)$/;
    const TAIL_1_RE = /[把被将为向对给跟和与在到了的得地了着过就都也才而并更还]$/;
    const TOL = 6;

    const PAIRS = [
        { open: '“', close: '”' }, { open: '‘', close: '’' },
        { open: '"', close: '"' }, { open: "'", close: "'" },
        { open: '《', close: '》' }, { open: '（', close: '）' }, { open: '(', close: ')' },
        { open: '【', close: '】' }, { open: '[', close: ']' }, { open: '{', close: '}' }
    ];

    const strLen = s => [...(s ?? '')].length;
    const splitToArr = s => [...(s ?? '')];

    const isInsidePair = (leftStr, pair) => {
        if (pair.open === pair.close) {
            const c = (leftStr.match(new RegExp(`\\${pair.open}`, 'g')) || []).length;
            return c % 2 === 1; // 对称引号奇偶判断
        } else {
            const o = (leftStr.match(new RegExp(`\\${pair.open}`, 'g')) || []).length;
            const c = (leftStr.match(new RegExp(`\\${pair.close}`, 'g')) || []).length;
            return o > c; // 开多于关 => 内部
        }
    };

    const findNextIndex = (arr, start, set) => {
        for (let i = start; i < arr.length; i++) if (set.has(arr[i])) return i;
        return -1;
    };
    const findPrevIndex = (arr, start, set) => {
        for (let i = start - 1; i >= 0; i--) if (set.has(arr[i])) return i;
        return -1;
    };

    const chunks = [];
    let s = String(text || '').trim();
    if (!s) return chunks;

    while (strLen(s) > maxChars) {
        const arr = splitToArr(s);

        // 1) 初始切点 + 回溯软断点（优先断在标点后）
        let cut = maxChars;
        let found = -1;
        const backSpan = Math.min(6, maxChars - 1);
        for (let i = Math.min(arr.length, maxChars) - 1; i >= Math.max(0, maxChars - backSpan); i--) {
            if (SEP_RE.test(arr[i])) { found = i + 1; break; }
        }
        if (found > 0 && found >= Math.floor(maxChars * 0.6)) cut = found;

        let left = arr.slice(0, cut).join('');
        let right = arr.slice(cut).join('');

        // 2) 成对符号安全切分：不在引号内部断句
        const activePair = PAIRS.find(p => isInsidePair(left, p));
        if (activePair && left && right) {
            const OPENSET = new Set([activePair.open]);
            const CLOSESET = new Set([activePair.close]);
            const back = findPrevIndex(arr, cut, OPENSET);
            const forward = findNextIndex(arr, cut, CLOSESET);

            if (back >= 0 && forward !== -1) {
                const backOk = back >= Math.floor(maxChars * 0.4);
                const forwardOk = (forward + 1) <= Math.min(arr.length, maxChars + TOL);

                if (backOk && forwardOk) {
                    // 选离目标切点更近的边界：开引号前 / 闭引号后
                    cut = (cut - back <= (forward + 1) - cut) ? back : (forward + 1);
                } else if (backOk) {
                    cut = back;
                } else if (forwardOk) {
                    cut = forward + 1;
                } else {
                    cut = (forward !== -1 && (forward + 1) - maxChars <= TOL) ? (forward + 1) : (back >= 0 ? back : cut);
                }

                left = arr.slice(0, cut).join('');
                right = arr.slice(cut).join('');
            }
        }

        // 3) 超限回缩
        if ([...left].length > (maxChars + TOL)) {
            const larr = splitToArr(left);
            let backTo = -1;
            for (let i = larr.length - 1; i >= Math.floor(maxChars * 0.7); i--) {
                if (SEP_RE.test(larr[i])) { backTo = i + 1; break; }
            }
            if (backTo !== -1) {
                right = larr.slice(backTo).join('') + right;
                left = larr.slice(0, backTo).join('');
            } else {
                const rarr = splitToArr(right);
                let fwd = -1;
                for (let i = 0; i < Math.min(TOL, rarr.length); i++) {
                    if (SEP_RE.test(rarr[i])) { fwd = i + 1; break; }
                }
                if (fwd !== -1) {
                    left = left + rarr.slice(0, fwd).join('');
                    right = rarr.slice(fwd).join('');
                }
            }
        }

        // 4) 挂尾字修正
        if (left && right) {
            const larr = splitToArr(left);
            if (/[^\s]/.test(left)) {
                if (TAIL_2_RE.test(left) && larr.length >= 2) {
                    right = larr.slice(-2).join('') + right;
                    left = larr.slice(0, -2).join('');
                } else if (TAIL_1_RE.test(left) && larr.length >= 1) {
                    right = larr.slice(-1).join('') + right;
                    left = larr.slice(0, -1).join('');
                }
            }
        }

        // 5) 短尾修正（避免右侧只剩 1–2 个字符）
        const rlen = [...right].length;
        if (rlen > 0 && rlen <= 2) {
            const larr = splitToArr(left);
            let pull = Math.min(2, larr.length);
            const OPEN_SET = new Set(PAIRS.map(p => p.open));
            if (pull > 0 && OPEN_SET.has(larr[larr.length - 1])) pull -= 1; // 不要把开引号拉到右边
            if (pull > 0) {
                right = larr.slice(-pull).join('') + right;
                left = larr.slice(0, -pull).join('');
            }
        }

        if (left.trim()) chunks.push(left.trim());
        s = right.trim();
        if (!s) break;
    }

    if (s) chunks.push(s);
    return chunks;
}

/* ==== 文本块生产（去掉逗号/句号，字体+字间距在文本素材里设置） ==== */
function splitCaptionsToTextItems(captions, audioDurationsUs, { maxChars = 14 } = {}) {
    // 把 逗号/句号/顿号 → 空格；可按需扩展
    const punctToSpace = s => String(s || '').replace(/[，,。\.、]/g, ' ');

    const items = [];
    const U = x => (typeof x === 'number' && isFinite(x) && x > 0) ? Math.round(x) : 0;

    for (let i = 0; i < audioDurationsUs.length; i++) {
        const totalUs = U(audioDurationsUs[i]);
        const raw = (captions && captions[i]) ? String(captions[i]) : '';
        const text = raw.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim();
        if (!text) { items.push({ text: ' ', duration: totalUs }); continue; }

        // 保持原有切分逻辑（仍用标点做句读），之后再做替换为空格
        let sentences = text.split(/[，。！？!?:：；,…]+/).map(s => s.trim()).filter(Boolean);
        if (!sentences.length) sentences = [text];

        const allChunks = sentences.flatMap(s => chunkByChars(s, maxChars));
        const chunks = allChunks.map(c => {
            // 标点→空格，并合并连续空格
            const cleaned = punctToSpace(c).replace(/\s+/g, ' ').trim();
            return cleaned.length ? cleaned : ' ';
        });

        // 用“净字符数”分配时长
        const lens = chunks.map(s => [...s].length);
        const sumLen = lens.reduce((a, b) => a + b, 0) || 1;

        let acc = 0;
        for (let j = 0; j < chunks.length; j++) {
            let d = Math.round(totalUs * (lens[j] / sumLen));
            if (j === chunks.length - 1) d = totalUs - acc;
            acc += d;
            items.push({ text: chunks[j], duration: U(d) });
        }
    }
    return items;
}


/* ==== download & duration ==== */
async function fetchAsBlob(url) {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.blob();
}
function getAudioDurationFromBlob(blob) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio();
        const cleanup = () => URL.revokeObjectURL(url);
        audio.preload = 'metadata';
        audio.addEventListener('loadedmetadata', () => {
            const d = (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : 0;
            cleanup(); resolve(d || 0);
        });
        audio.addEventListener('error', () => { cleanup(); resolve(0); });
        audio.src = url;
    });
}

/* ==== UI refs ==== */
const pickBtn = document.getElementById('pickJY');
// const resetBtn = document.getElementById('resetAll');
const pathView = document.getElementById('jyPathDisplay');
const hintNotSel = document.getElementById('jyHintNotSelected');
const hintSel = document.getElementById('jyHintSelected');

const encodedInput = document.getElementById('encodedInput');
const secretKey = document.getElementById('secretKey');
const themeSel = document.getElementById('theme');
const aspectSel = document.getElementById('aspect');
const maxCharsInput = document.getElementById('maxChars');

const startBtn = document.getElementById('startBtn');
const runStatus = document.getElementById('runStatus');

const filesCard = document.getElementById('filesCard');
const resultCard = document.getElementById('resultCard');
const tbody = document.getElementById('filesTbody');
const errorBox = document.getElementById('errorBox');
const tsOutput = document.getElementById('tsOutput');
const resultSummary = document.getElementById('resultSummary');

const imgModal = document.getElementById('imgModal');
const imgPreview = document.getElementById('imgPreview');
imgModal.addEventListener('click', () => imgModal.classList.remove('open'));

/* ==== start button disabled when no secret ==== */
function updateStartBtnDisabled() {
    startBtn.disabled = !(secretKey.value.trim().length > 0);
}
updateStartBtnDisabled();
secretKey.addEventListener('input', updateStartBtnDisabled);

/* ==== directory & stateful UI ==== */
let dirHandle = null;

function updateDirUI() {
    const selected = !!dirHandle;
    if (selected) {
        pathView.textContent = `（已选择）${dirHandle.name}`;
        pathView.classList.add('selected');
        hintSel.classList.remove('hidden');
        hintNotSel.classList.add('hidden');
        pickBtn.classList.add('ghost');
        pickBtn.textContent = '重新选择剪映目录';
    } else {
        pathView.textContent = '尚未选择';
        pathView.classList.remove('selected');
        hintSel.classList.add('hidden');
        hintNotSel.classList.remove('hidden');
        pickBtn.classList.remove('ghost');
        pickBtn.textContent = '选择剪映目录';
    }
}

async function initHandle() {
    try {
        const stored = await idbGet(HANDLE_KEY);
        if (stored) {
            dirHandle = stored;
            await verifyPermission(dirHandle, true);
        }
    } catch (e) { console.warn(e); }
    updateDirUI();
}
initHandle();

pickBtn.addEventListener('click', async () => {
    try {
        const h = await window.showDirectoryPicker({ id: 'jianying-root' });
        if (!(await verifyPermission(h, true))) { alert('需要写入权限'); return; }
        dirHandle = h; await idbSet(HANDLE_KEY, h);
        updateDirUI();
    } catch (e) { if (e?.name === 'AbortError') return; alert('选择目录失败：' + (e.message || e)); }
});
// resetBtn.addEventListener('click', async () => {
//     await idbSet(HANDLE_KEY, undefined); dirHandle = null; updateDirUI(); alert('已清除记忆，请重新选择剪映目录。');
// });

/* ==== table row ==== */
function addFileRow({ type, name, href, durationSec }) {
    const tr = document.createElement('tr');
    const tdType = document.createElement('td'); tdType.textContent = type;
    const tdName = document.createElement('td'); tdName.textContent = name;
    const tdDur = document.createElement('td'); tdDur.textContent = (type === '音频' ? (durationSec ? durationSec.toFixed(3) + 's' : '0s') : '-');
    const tdPrev = document.createElement('td');
    if (type === '图片' || type === '背景') {
        const img = document.createElement('img'); img.src = href; img.alt = name; img.className = 'preview-img';
        img.addEventListener('click', () => { imgPreview.src = href; imgModal.classList.add('open'); });
        tdPrev.appendChild(img);
    } else if (type === '音频') {
        const btn = document.createElement('button'); btn.textContent = '▶︎';
        btn.title = '播放/暂停';
        btn.addEventListener('click', () => {
            if (!btn._audio) { btn._audio = new Audio(href); }
            if (btn._audio.paused) { btn._audio.play(); btn.textContent = '⏸'; }
            else { btn._audio.pause(); btn.textContent = '▶︎'; }
        });
        const wrap = document.createElement('div'); wrap.className = 'audio-controls'; wrap.appendChild(btn); tdPrev.appendChild(wrap);
    } else { tdPrev.textContent = '-'; }
    const tdStatus = document.createElement('td'); tdStatus.className = 'status muted'; tdStatus.textContent = '等待';
    tr.append(tdType, tdName, tdDur, tdPrev, tdStatus); tbody.appendChild(tr);
    return { tr, tdStatus };
}

/* ==== Jianying builders ==== */
// 文本入/出场动画
const TEXT_ANIM = {
    IN: { name: '渐显', id: '1644304', resource_id: '6724916044072227332' },
    OUT: { name: '渐隐', id: '1644600', resource_id: '6724919382104871427' }
};
const TEXT_OUT_FADE_US = 300000;

// 免费入场动画映射 + 默认时长（μs）
const ANIM_MAP = {
    "缩小": { id: "624755", resource_id: "6798332584276267527", dur_us: 500000 },
    "渐显": { id: "624705", resource_id: "6798320778182922760", dur_us: 500000 },
    "放大": { id: "624751", resource_id: "6798332733694153230", dur_us: 500000 },
    "旋转": { id: "624731", resource_id: "6798334070653719054", dur_us: 500000 },
    "Kira游动": { id: "34176967", resource_id: "7311984593387655731", dur_us: 2267000 },
    "抖动下降": { id: "1206320", resource_id: "6991764455931515422", dur_us: 500000 },
    "镜像翻转": { id: "646003", resource_id: "6797338697625768455", dur_us: 500000 },
    "旋转开幕": { id: "8295043", resource_id: "7186944542409495099", dur_us: 1000000 },
    "折叠开幕": { id: "14506065", resource_id: "7239273897491698232", dur_us: 1500000 },
    "漩涡旋转": { id: "703281", resource_id: "6782010677520241165", dur_us: 500000 },
    "跳转开幕": { id: "23185431", resource_id: "7279999334001676857", dur_us: 733000 },
    "轻微抖动": { id: "431664", resource_id: "6739418227031413256", dur_us: 500000 },
    "轻微抖动 II": { id: "431650", resource_id: "6739418677910704651", dur_us: 500000 },
    "轻微抖动 III": { id: "503136", resource_id: "6781683302672634382", dur_us: 500000 },
    "上下抖动": { id: "431652", resource_id: "6739418390030455300", dur_us: 500000 },
    "左右抖动": { id: "431654", resource_id: "6739418540421419524", dur_us: 500000 },
    "斜切": { id: "10696371", resource_id: "7210657307938525751", dur_us: 700000 },
    "钟摆": { id: "636115", resource_id: "6803260897117606414", dur_us: 500000 },
    "雨刷": { id: "634681", resource_id: "6802871256849846791", dur_us: 500000 },
    "雨刷 II": { id: "640101", resource_id: "6805748897768542727", dur_us: 500000 },
    "向上转入": { id: "645307", resource_id: "6808401616564130312", dur_us: 500000 },
    "向上转入 II": { id: "701961", resource_id: "6818747060649464327", dur_us: 500000 },
    "向左转入": { id: "699157", resource_id: "6816560956647150093", dur_us: 500000 },
    "向右转入": { id: "638825", resource_id: "6805019065761927694", dur_us: 500000 },
    "向上滑动": { id: "624739", resource_id: "6798333487523828238", dur_us: 500000 },
    "向下滑动": { id: "624735", resource_id: "6798333705401143816", dur_us: 500000 },
    "向左滑动": { id: "624747", resource_id: "6798332871267324423", dur_us: 500000 },
    "向右滑动": { id: "624743", resource_id: "6798333076469453320", dur_us: 500000 },
    "向下甩入": { id: "431638", resource_id: "6739338374441603598", dur_us: 500000 },
    "向右甩入": { id: "431636", resource_id: "6739338727866241539", dur_us: 500000 },
    "向左上甩入": { id: "431648", resource_id: "6740122563692728844", dur_us: 500000 },
    "向右上甩入": { id: "431644", resource_id: "6740122731418751495", dur_us: 500000 },
    "向左下甩入": { id: "431642", resource_id: "6739395445346275853", dur_us: 500000 },
    "向右下甩入": { id: "431640", resource_id: "6739395718223499787", dur_us: 500000 },
    "动感放大": { id: "431662", resource_id: "6740867832570974733", dur_us: 500000 },
    "动感缩小": { id: "431658", resource_id: "6740868384637850120", dur_us: 500000 },
    "轻微放大": { id: "629085", resource_id: "6800268825611735559", dur_us: 500000 }
};
// 动画轮换列表
const animNames = Object.keys(ANIM_MAP);
const DEFAULT_ANIM_DUR = 500000; // 0.5s 兜底

const DRAFT_PREFIX = '##_draftpath_placeholder_0E685133-18CE-45ED-8CB8-2904A212EC80_##/';

function buildDraftMetaInfo() {
    return {
        "draft_cloud_capcut_purchase_info": "", "draft_cloud_last_action_download": false, "draft_cloud_purchase_info": "",
        "draft_cloud_template_id": "", "draft_cloud_tutorial_info": "", "draft_cloud_videocut_purchase_info": "",
        "draft_cover": "", "draft_deeplink_url": "", "draft_enterprise_info": { "draft_enterprise_extra": "", "draft_enterprise_id": "", "draft_enterprise_name": "" },
        "draft_fold_path": "", "draft_id": "", "draft_is_article_video_draft": false, "draft_is_from_deeplink": "false",
        "draft_materials": [{ "type": 0, "value": [] }, { "type": 1, "value": [] }, { "type": 2, "value": [] }, { "type": 3, "value": [] }, { "type": 6, "value": [] }, { "type": 7, "value": [] }, { "type": 8, "value": [] }],
        "draft_materials_copied_info": [], "draft_name": "", "draft_new_version": "", "draft_removable_storage_device": "", "draft_root_path": "",
        "draft_segment_extra_info": [], "draft_timeline_materials_size_": 0, "tm_draft_cloud_completed": "", "tm_draft_cloud_modified": 0, "tm_draft_create": 0, "tm_draft_modified": 0, "tm_duration": 0
    };
}

function makeTextContentObject(txt) {
    const len = [...txt].length || 1;
    return {
        styles: [{
            fill: { alpha: 1.0, content: { render_type: "solid", solid: { alpha: 1.0, color: [1, 1, 1] } } },
            range: [0, len], size: 10, bold: false, italic: false, underline: false,
            strokes: [{ content: { solid: { alpha: 1.0, color: [0, 0, 0] } }, width: 0.08 }],
            font: { id: "6740435892441190919", path: "c:/新青年.ttf" } // 新青年体
        }],
        text: txt
    };
}

function buildDraftInfo({ width, height, fps, totalUs, audioDurationsUs, imageCount, textItems }) {
    const draftId = (randHex(8) + '-' + randHex(4) + '-' + randHex(4) + '-' + randHex(4) + '-' + randHex(12)).toUpperCase();
    const speeds = [], audio_fades = [], material_animations = [];

    // 音频材料
    const audioMaterials = audioDurationsUs.map((dur, i) => ({
        app_id: 0, category_id: "", category_name: "local", check_flag: 1, copyright_limit_type: "none",
        duration: dur, effect_id: "", formula_id: "", id: randHex(16), intensifies_path: "",
        is_ai_clone_tone: false, is_text_edit_overdub: false, is_ugc: false, local_material_id: null, music_id: null,
        name: `audio_${i + 1}.mp3`, path: `${DRAFT_PREFIX}assets/audio/audio_${i + 1}.mp3`,
        query: "", request_id: "", resource_id: "", search_id: "", source_from: "", source_platform: 0, team_id: "",
        text_id: "", tone_category_id: "", tone_category_name: "", tone_effect_id: "", tone_effect_name: "",
        tone_platform: "", tone_second_category_id: "", tone_second_category_name: "", tone_speaker: "", tone_type: "",
        type: "extract_music", video_id: "", wave_points: []
    }));

    // 视频材料
    const videoMaterials = [
        {
            audio_fade: null, category_id: "", category_name: "local", check_flag: 63487,
            crop: { upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0, lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1 },
            crop_ratio: "free", crop_scale: 1, duration: totalUs, height: height, id: randHex(16),
            local_material_id: "", material_id: null, material_name: "bg_image.png", media_path: "",
            path: `${DRAFT_PREFIX}assets/bg/bg_image.png`, type: "photo", width: width
        },
        ...Array.from({ length: imageCount }, (_, i) => ({
            audio_fade: null, category_id: "", category_name: "local", check_flag: 63487,
            crop: { upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0, lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1 },
            crop_ratio: "free", crop_scale: 1, duration: totalUs, height: Math.round(height * 0.4875), id: randHex(16),
            local_material_id: "", material_id: null, material_name: `image_${i + 1}.png`, media_path: "",
            path: `${DRAFT_PREFIX}assets/images/image_${i + 1}.png`, type: "photo", width: Math.round(width * 1.54)
        }))
    ];
    videoMaterials.forEach(vm => vm.material_id = vm.id);

    // 音频轨段
    let aStart = 0;
    const audioSegments = audioMaterials.map((mat, i) => {
        const dur = audioDurationsUs[i];
        const speedRef = randHex(16), fadeRef = randHex(16);
        speeds.push({ id: speedRef, curve_speed: null, mode: 0, speed: 1.0, type: "speed" });
        audio_fades.push({ id: fadeRef, fade_in_duration: 1, fade_out_duration: 1, fade_type: 0, type: "audio_fade" });
        const seg = {
            enable_adjust: true, enable_color_correct_adjust: false, enable_color_curves: true, enable_color_match_adjust: false, enable_color_wheels: true,
            enable_lut: true, enable_smart_color_adjust: false, last_nonzero_volume: 1.0, reverse: false, track_attribute: 0, track_render_index: 0, visible: true,
            id: randHex(16), material_id: mat.id, target_timerange: { start: aStart, duration: dur }, common_keyframes: [], keyframe_refs: [],
            source_timerange: { start: 0, duration: dur }, speed: 1.0, volume: 1.0, extra_material_refs: [speedRef, fadeRef], clip: null, hdr_settings: null, render_index: 0
        };
        aStart += dur; return seg;
    });

    // 背景段
    const bgSeg = {
        enable_adjust: true, enable_color_correct_adjust: false, enable_color_curves: true, enable_color_match_adjust: false, enable_color_wheels: true,
        enable_lut: true, enable_smart_color_adjust: false, last_nonzero_volume: 1.0, reverse: false, track_attribute: 0, track_render_index: 0, visible: true,
        id: randHex(16), material_id: videoMaterials[0].id, target_timerange: { start: 0, duration: totalUs }, common_keyframes: [], keyframe_refs: [],
        source_timerange: { start: 0, duration: totalUs }, speed: 1.0, volume: 1.0, extra_material_refs: [randHex(16)],
        clip: { alpha: 1, flip: { horizontal: false, vertical: false }, rotation: 0, scale: { x: 1, y: 1 }, transform: { x: 0, y: 0 } },
        uniform_scale: { on: true, value: 1.0 }, hdr_settings: { intensity: 1.0, mode: 1, nits: 1000 }, render_index: 0
    };
    speeds.push({ id: bgSeg.extra_material_refs[0], curve_speed: null, mode: 0, speed: 1.0, type: "speed" });

    // 图片段（入场动画）
    const videoSegments = []; let vStart = 0;
    for (let i = 0; i < imageCount; i++) {
        const dur = audioDurationsUs[i] ?? 0;
        const vm = videoMaterials[i + 1]; if (!vm) break;

        const pick = animNames[i % animNames.length];
        const mapped = ANIM_MAP[pick] || ANIM_MAP['渐显'];
        const animId = randHex(16);

        material_animations.push({
            id: animId, type: "sticker_animation", multi_language_current: "none",
            animations: [{
                anim_adjust_params: null, platform: "all", panel: "video", material_type: "video",
                name: pick, id: mapped.id, type: "in", resource_id: mapped.resource_id,
                start: 0, duration: Number.isFinite(mapped.dur_us) ? mapped.dur_us : DEFAULT_ANIM_DUR
            }]
        });

        const speedRef = randHex(16); speeds.push({ id: speedRef, curve_speed: null, mode: 0, speed: 1.0, type: "speed" });
        videoSegments.push({
            enable_adjust: true, enable_color_correct_adjust: false, enable_color_curves: true, enable_color_match_adjust: false, enable_color_wheels: true,
            enable_lut: true, enable_smart_color_adjust: false, last_nonzero_volume: 1.0, reverse: false, track_attribute: 0, track_render_index: 0, visible: true,
            id: randHex(16), material_id: vm.id, target_timerange: { start: vStart, duration: dur }, common_keyframes: [], keyframe_refs: [],
            source_timerange: { start: 0, duration: dur }, speed: 1.0, volume: 1.0, extra_material_refs: [speedRef, animId],
            clip: { alpha: 1, flip: { horizontal: false, vertical: false }, rotation: 0, scale: { x: 1, y: 1 }, transform: { x: 0, y: 0 } },
            uniform_scale: { on: true, value: 1.0 }, hdr_settings: { intensity: 1.0, mode: 1, nits: 1000 }, render_index: 0
        });
        vStart += dur;
    }

    // 文本材料（字体 & 字间距）
    const textMaterials = textItems.map(it => {
        const t = (typeof it?.text === 'string' && it.text.trim()) ? it.text : ' ';
        return {
            id: randHex(16),
            content: JSON.stringify(makeTextContentObject(t)),
            text: t,
            typesetting: 0, alignment: 0,
            letter_spacing: 0.1,      // ← 字间距
            line_spacing: 0.02, line_feed: 1,
            line_max_width: 0.86, force_apply_line_max_width: true,
            check_flag: 15, type: "text"
        };
    });

    // 文本段（出场动画 0.3s 过渡）
    const textSegments = []; let tStart = 0;
    for (let i = 0; i < textItems.length; i++) {
        const dur = Math.max(0, Number(textItems[i].duration) || 0);
        const animId = randHex(16);
        material_animations.push({
            id: animId, type: "sticker_animation", multi_language_current: "none",
            animations: [
                { platform: "all", panel: "", material_type: "sticker", name: TEXT_ANIM.IN.name, id: TEXT_ANIM.IN.id, type: "in", resource_id: TEXT_ANIM.IN.resource_id, start: 0, duration: 0 },
                { platform: "all", panel: "", material_type: "sticker", name: TEXT_ANIM.OUT.name, id: TEXT_ANIM.OUT.id, type: "out", resource_id: TEXT_ANIM.OUT.resource_id, start: Math.max(dur - TEXT_OUT_FADE_US, 0), duration: TEXT_OUT_FADE_US }
            ]
        });
        textSegments.push({
            enable_adjust: true, enable_color_correct_adjust: false, enable_color_curves: true, enable_color_match_adjust: false, enable_color_wheels: true,
            enable_lut: true, enable_smart_color_adjust: false, last_nonzero_volume: 1.0, reverse: false, track_attribute: 0, track_render_index: 0, visible: true,
            id: randHex(16), material_id: textMaterials[i].id,
            target_timerange: { start: tStart, duration: dur }, common_keyframes: [], keyframe_refs: [], source_timerange: null,
            speed: 1.0, volume: 1.0, extra_material_refs: [animId],
            clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0.0, scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: -0.36 } },
            uniform_scale: { on: true, value: 1.0 }, render_index: 15000
        });
        tStart += dur;
    }

    return {
        canvas_config: { width, height, ratio: "original" }, color_space: 0,
        config: {
            adjust_max_index: 1, attachment_info: [], combination_max_index: 1, export_range: null,
            extract_audio_last_index: 1, lyrics_recognition_id: "", lyrics_sync: true, lyrics_taskinfo: [],
            maintrack_adsorb: true, material_save_mode: 0, multi_language_current: "none", multi_language_list: [], multi_language_main: "none",
            multi_language_mode: "none", original_sound_last_index: 1, record_audio_last_index: 1, sticker_max_index: 1,
            subtitle_keywords_config: null, subtitle_recognition_id: "", subtitle_sync: true, subtitle_taskinfo: [],
            system_font_list: [], video_mute: false, zoom_info_params: null
        },
        cover: null, create_time: 0, duration: totalUs, extra_info: null, fps, free_render_index_mode_on: false,
        group_container: null, id: draftId, keyframe_graph_list: [],
        keyframes: { adjusts: [], audios: [], effects: [], filters: [], handwrites: [], stickers: [], texts: [], videos: [] },
        last_modified_platform: { app_id: 3704, app_source: "cc", app_version: "5.9.0", device_id: "", hard_disk_id: "", mac_address: "", os: "mac", os_version: "14.5" },
        materials: {
            ai_translates: [], audio_balances: [], audio_effects: [], audio_fades, audio_track_indexes: [], audios: audioMaterials,
            beats: [], canvases: [], chromas: [], color_curves: [], digital_humans: [], drafts: [], effects: [], flowers: [], green_screens: [],
            handwrites: [], hsl: [], images: [], log_color_wheels: [], loudnesses: [], manual_deformations: [], masks: [],
            material_animations, material_colors: [], multi_language_refs: [], placeholders: [], plugin_effects: [],
            primary_color_wheels: [], realtime_denoises: [], shapes: [], smart_crops: [], smart_relights: [], sound_channel_mappings: [],
            speeds, stickers: [], tail_leaders: [], text_templates: [], texts: textMaterials, time_marks: [], transitions: [],
            video_effects: [], video_trackings: [], videos: videoMaterials, vocal_beautifys: [], vocal_separations: []
        },
        mutable_config: null, name: "", new_version: "110.0.0", relationships: [], render_index_track_mode_on: false, retouch_cover: null,
        source: "default", static_cover_image_path: "", time_marks: null,
        tracks: [
            { attribute: 0, flag: 0, id: randHex(16), is_default_name: false, name: "audio", segments: audioSegments, type: "audio" },
            { attribute: 0, flag: 0, id: randHex(16), is_default_name: false, name: "bg_video", segments: [bgSeg], type: "video" },
            { attribute: 0, flag: 0, id: randHex(16), is_default_name: false, name: "my_video", segments: videoSegments, type: "video" },
            { attribute: 0, flag: 0, id: randHex(16), is_default_name: false, name: "text", segments: textSegments, type: "text" }
        ],
        update_time: 0, version: 360000
    };
}

/* ==== core run ==== */
startBtn.addEventListener('click', async () => {
    filesCard.classList.remove('hidden');
    resultCard.classList.remove('hidden');

    errorBox.textContent = '';
    runStatus.textContent = '处理中…';
    tbody.innerHTML = '';
    tsOutput.value = '';
    resultSummary.textContent = '处理中…';

    try {
        if (!dirHandle) throw new Error('请先选择剪映目录（点击页面顶部的“选择剪映目录”按钮并授权写入）');
        if (!(await verifyPermission(dirHandle, true))) throw new Error('没有对剪映目录的写入权限');
        const encoded = (encodedInput.value || '').trim();
        const key = (secretKey.value || '').trim();
        if (!encoded) throw new Error('请粘贴加密字符串');
        if (!key) throw new Error('请输入解密密钥');

        const decoded = await secureDecode(encoded, key);
        console.log("解码后内容为：", decoded)
        const audio_list_raw = typeof decoded.audio_list === 'string' ? JSON.parse(decoded.audio_list) : decoded.audio_list || [];
        const image_list_raw = typeof decoded.image_list === 'string' ? JSON.parse(decoded.image_list) : decoded.image_list || [];
        const bg_raw = typeof decoded.bg_image === 'string' ? JSON.parse(decoded.bg_image) : decoded.bg_image;
        const bg_url = Array.isArray(bg_raw) ? (bg_raw[0]?.image_url || bg_raw[0] || '') : (bg_raw?.image_url || bg_raw || decoded.bg_image || '');

        const [wStr, hStr] = (aspectSel.value || '1080x1920').split('x');
        // const [wStr, hStr] = (aspectSel.value || '1080x1920').split('x');
        const WIDTH = parseInt(wStr, 10), HEIGHT = parseInt(hStr, 10), fps = 30;

        const stamp = tsNow(); tsOutput.value = stamp;
        const draftRoot = await ensureDir(dirHandle, stamp);
        const assetsDir = await ensureDir(draftRoot, 'assets');
        const audioDir = await ensureDir(assetsDir, 'audio');
        const imgDir = await ensureDir(assetsDir, 'images');
        const bgDir = await ensureDir(assetsDir, 'bg');

        const audioDurationsSec = [];
        for (let i = 0; i < audio_list_raw.length; i++) {
            const url = audio_list_raw[i];
            const row = addFileRow({ type: '音频', name: `audio_${i + 1}.mp3`, href: url, durationSec: 0 });
            row.tdStatus.textContent = '下载中…';
            try {
                const blob = await fetchAsBlob(url);
                const dur = await getAudioDurationFromBlob(blob);
                audioDurationsSec.push(dur);
                await writeFile(audioDir, `audio_${i + 1}.mp3`, blob);
                row.tr.children[2].textContent = dur ? dur.toFixed(3) + 's' : '0s';
                row.tdStatus.innerHTML = '<span class="ok">已保存</span>';
            } catch (e) {
                row.tdStatus.innerHTML = `<span class="error">失败</span>`;
                throw new Error(`音频下载失败：${url}；${e.message || e}`);
            }
        }

        for (let i = 0; i < image_list_raw.length; i++) {
            const url = image_list_raw[i];
            const row = addFileRow({ type: '图片', name: `image_${i + 1}.png`, href: url, durationSec: 0 });
            row.tdStatus.textContent = '下载中…';
            try {
                const blob = await fetchAsBlob(url);
                await writeFile(imgDir, `image_${i + 1}.png`, blob);
                row.tdStatus.innerHTML = '<span class="ok">已保存</span>';
            } catch (e) {
                row.tdStatus.innerHTML = `<span class="error">失败</span>`;
                throw new Error(`图片下载失败：${url}；${e.message || e}`);
            }
        }

        if (bg_url) {
            const row = addFileRow({ type: '背景', name: `bg_image.png`, href: bg_url, durationSec: 0 });
            row.tdStatus.textContent = '下载中…';
            try {
                const blob = await fetchAsBlob(bg_url);
                await writeFile(bgDir, 'bg_image.png', blob);
                row.tdStatus.innerHTML = '<span class="ok">已保存</span>';
            } catch (e) {
                row.tdStatus.innerHTML = `<span class="error">失败</span>`;
                throw new Error(`背景下载失败：${bg_url}；${e.message || e}`);
            }
        }

        const audioDurationsUs = audioDurationsSec.map(toUS);
        const totalSec = audioDurationsSec.reduce((a, b) => a + b, 0);
        const totalUs = toUS(totalSec);

        let caps = extractCaptions(decoded);
        if (caps.length > audioDurationsUs.length) caps = caps.slice(0, audioDurationsUs.length);
        if (caps.length < audioDurationsUs.length) caps = caps.concat(Array(audioDurationsUs.length - caps.length).fill(''));

        const maxChars = Math.max(6, Math.min(40, parseInt(maxCharsInput.value, 10) || 14));
        const textItems = splitCaptionsToTextItems(caps, audioDurationsUs, { maxChars });

        const meta = buildDraftMetaInfo();
        const info = buildDraftInfo({
            width: WIDTH, height: HEIGHT, fps, totalUs,
            audioDurationsUs, imageCount: image_list_raw.length,
            textItems
        });

        await writeFile(draftRoot, 'draft_meta_info.json', new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }));
        await writeFile(draftRoot, 'draft_info.json', new Blob([JSON.stringify(info, null, 2)], { type: 'application/json' }));

        runStatus.textContent = '完成';
        resultSummary.innerHTML = `已生成：<code>${stamp}</code><br/>总时长：<b>${totalSec.toFixed(3)}s</b>；音频：${audioDurationsSec.length} 个；图片：${image_list_raw.length} 张；画幅：${WIDTH}×${HEIGHT}；字幕片段：${textItems.length}（maxChars=${maxChars}）`;
    } catch (e) {
        console.error(e);
        runStatus.textContent = '出错';
        errorBox.textContent = '❌ ' + (e?.message || e);
    } finally {
        updateStartBtnDisabled(); // 根据密钥是否为空恢复状态
    }
});

/* ==== Help image (draft path guide) ==== */
const HELP_IMG_SRC = './assets/jy-draft.png'; // 你的指引图路径
// const openHelpBtn = document.getElementById('openHelp');
const openHelpLink = document.getElementById('openHelpLink');  // 新的“超链接”按钮
const helpModal = document.getElementById('helpModal');
const helpImage = document.getElementById('helpImage');

function openHelpModal() {
    if (!helpImage.src) helpImage.src = HELP_IMG_SRC; // 首次打开再加载
    helpModal.classList.add('open');
}
// openHelpBtn && openHelpBtn.addEventListener('click', openHelpModal);
openHelpLink && openHelpLink.addEventListener('click', openHelpModal);

// 关闭逻辑（你若已加过可忽略）
helpModal?.addEventListener('click', (e) => {
    if (e.target === helpModal || e.target.classList.contains('modal-close')) {
        helpModal.classList.remove('open');
    }
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal.open')
        .forEach(m => m.classList.remove('open'));
});
