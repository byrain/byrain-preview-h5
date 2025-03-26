// 主要应用逻辑
import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'

// const app = new Vue({
const app = createApp({
    data() {
        return {
            loading: true,
            currentDate: new Date().toLocaleDateString('zh-CN'),
            // 其他数据项...
            // 统计数据
            totalDramas: 0,
            aiUsageRate: 0,
            avgCensorshipApprovalRate: 0,
            aiData: {},  // 添加此行定义 aiData
            // 数据集
            dramaData: [],
            shortDramaData: [],
            platformData: [],
            aiApplicationData: [],
            censorshipData: [],
            userBehaviorData: {},
            // 筛选条件
            filters: {
                platform: 'all',
                genre: 'all',
                aiUsage: 'all',
                minRating: 6.5,
                year: 2024
            },
            // 排序
            sortBy: 'rating',
            sortOrder: 'desc',
            // 图表实例
            charts: {
                platformCompetition: null,
                genreDistribution: null,
                aiUsageByPlatform: null,
                censorshipByGenre: null,
                userDemographics: null,
                viewingTrends: null,
                aiEffectiveness: null,
                marketReturns: null
            },

            // 当前选中的剧集
            selectedDrama: null,
            // 当前视图
            currentView: 'overview',
            // 平台颜色映射
            platformColors: {
                '爱奇艺': '#00be06',
                '腾讯视频': '#ff0000',
                '优酷': '#00a0e9',
                '芒果TV': '#ff5800',
                '哔哩哔哩': '#fb7299',
                '抖音短剧': '#000000',
                'CCTV': '#c00000'
            },
            // 类型颜色映射
            genreColors: {
                '悬疑犯罪': '#8e44ad',
                '都市情感': '#3498db',
                '古装剧': '#e67e22',
                '科幻': '#2ecc71',
                '家庭剧': '#f1c40f',
                '青春校园': '#1abc9c',
                '职场剧': '#34495e',
                '主旋律': '#e74c3c',
                '历史正剧': '#7f8c8d',
                '都市奇幻': '#9b59b6'
            }
        }
    },
    computed: {
        // 根据筛选条件过滤的剧集
        filteredDramas() {
            let result = [...this.dramaData, ...this.shortDramaData];

            if (this.filters.platform !== 'all') {
                result = result.filter(drama => drama.platform === this.filters.platform);
            }

            if (this.filters.genre !== 'all') {
                result = result.filter(drama => drama.genre === this.filters.genre);
            }

            if (this.filters.aiUsage !== 'all') {
                const hasAi = this.filters.aiUsage === 'yes';
                result = result.filter(drama => (drama.ai_usage.scriptwriting || drama.ai_usage.post_production) === hasAi);
            }

            result = result.filter(drama => drama.rating >= this.filters.minRating);

            // 排序
            result.sort((a, b) => {
                let aValue = a[this.sortBy];
                let bValue = b[this.sortBy];

                if (this.sortOrder === 'asc') {
                    return aValue - bValue;
                } else {
                    return bValue - aValue;
                }
            });

            return result;
        },

        // 平台统计
        platformStats() {
            const stats = {};

            this.platformData.forEach(platform => {
                stats[platform.name] = {
                    totalDramas: platform.total_dramas,
                    avgRating: platform.average_rating,
                    aiUsageRate: platform.ai_usage_rate,
                    censorshipRate: platform.censorship_approval_rate,
                    userBase: platform.user_base_millions
                };
            });

            return stats;
        },

        // AI应用统计
        aiStats() {
            const scriptwritingCount = this.dramaData.filter(d => d.ai_usage.scriptwriting).length +
                this.shortDramaData.filter(d => d.ai_usage.scriptwriting).length;

            const postProductionCount = this.dramaData.filter(d => d.ai_usage.post_production).length +
                this.shortDramaData.filter(d => d.ai_usage.post_production).length;

            const totalDramas = this.dramaData.length + this.shortDramaData.length;

            this.aiData = {
                scriptwritingRate: (scriptwritingCount / totalDramas * 100).toFixed(1),
                postProductionRate: (postProductionCount / totalDramas * 100).toFixed(1),
                overallRate: ((scriptwritingCount + postProductionCount) / (totalDramas * 2) * 100).toFixed(1),
                costReduction: 35.8,
                timeReduction: 42.3
            };
        },

        // 审查统计
        censorshipStats() {
            const genreApproval = {};

            this.censorshipData.forEach(item => {
                genreApproval[item.genre] = {
                    approvalRate: item.approval_rate,
                    marketReturn: item.market_return,
                    riskFactor: item.risk_factor
                };
            });

            return genreApproval;
        }
    },
    methods: {
        // 加载所有数据
        async loadAllData() {
            this.loading = true;

            try {
                // 加载剧集数据
                const dramaResponse = await fetch('./data/drama_data.json');
                const dramaData = await dramaResponse.json();
                this.dramaData = dramaData.dramas;

                const dramaResponse2 = await fetch('./data/drama_data_2.json');
                const dramaData2 = await dramaResponse2.json();
                this.dramaData = [...this.dramaData, ...dramaData2.dramas];

                // 加载短剧数据
                const shortDramaResponse = await fetch('./data/short_drama_data.json');
                const shortDramaData = await shortDramaResponse.json();
                this.shortDramaData = shortDramaData.short_dramas;

                // 加载平台数据
                const platformResponse = await fetch('./data/platform_competition_data.json');
                const platformData = await platformResponse.json();
                this.platformData = platformData.platforms;

                // 加载AI应用数据
                const aiResponse = await fetch('./data/ai_application_cases.json');
                const aiData = await aiResponse.json();
                this.aiApplicationData = aiData.ai_applications;

                // 加载审查数据
                const censorshipResponse = await fetch('./data/censorship_genre_correlation.json');
                const censorshipData = await censorshipResponse.json();
                this.censorshipData = censorshipData.censorship_data;

                // 加载用户行为数据
                const userBehaviorResponse = await fetch('./data/user_behavior_insights.json');
                const userBehaviorData = await userBehaviorResponse.json();
                this.userBehaviorData = userBehaviorData.user_behavior;

                // 计算统计数据
                this.calculateStats();

                // 初始化图表
                this.$nextTick(() => {
                    this.initCharts();
                });
            } catch (error) {
                console.error('数据加载错误:', error);
            } finally {
                this.loading = false;
            }
        },

        // 计算统计数据
        calculateStats() {
            // 总剧集数
            this.totalDramas = this.dramaData.length + this.shortDramaData.length;

            // AI使用率
            const scriptwritingCount = this.dramaData.filter(d => d.ai_usage.scriptwriting).length +
                this.shortDramaData.filter(d => d.ai_usage.scriptwriting).length;

            const postProductionCount = this.dramaData.filter(d => d.ai_usage.post_production).length +
                this.shortDramaData.filter(d => d.ai_usage.post_production).length;

            this.aiUsageRate = (((scriptwritingCount + postProductionCount) / (this.totalDramas * 2)) * 100).toFixed(1);

            // 平均审查通过率
            let totalApprovalRate = 0;
            this.censorshipData.forEach(item => {
                totalApprovalRate += item.approval_rate;
            });

            this.avgCensorshipApprovalRate = (totalApprovalRate / this.censorshipData.length).toFixed(1);
        },

        // 初始化所有图表
        initCharts() {
            this.initPlatformCompetitionChart();
            this.initGenreDistributionChart();
            this.initAiUsageByPlatformChart();
            this.initCensorshipByGenreChart();
            this.initUserDemographicsChart();
            this.initViewingTrendsChart();
            this.initAiEffectivenessChart();
            this.initMarketReturnsChart();
        },

        // 平台竞争图表
        initPlatformCompetitionChart() {
            const chartDom = document.getElementById('platformCompetitionChart');
            if (!chartDom) return;

            this.charts.platformCompetition = echarts.init(chartDom);

            const platformNames = this.platformData.map(p => p.name);
            const totalDramas = this.platformData.map(p => p.total_dramas);
            const avgRatings = this.platformData.map(p => p.average_rating);
            const userBase = this.platformData.map(p => p.user_base_millions);

            const option = {
                tooltip: {
                    trigger: 'axis',
                    axisPointer: {
                        type: 'shadow'
                    }
                },
                legend: {
                    data: ['热门剧集数量', '平均评分', '用户基数(百万)']
                },
                grid: {
                    left: '3%',
                    right: '4%',
                    bottom: '3%',
                    containLabel: true
                },
                xAxis: {
                    type: 'category',
                    data: platformNames
                },
                yAxis: [
                    {
                        type: 'value',
                        name: '数量',
                        position: 'left'
                    },
                    {
                        type: 'value',
                        name: '评分',
                        min: 0,
                        max: 10,
                        position: 'right'
                    }
                ],
                series: [
                    {
                        name: '热门剧集数量',
                        type: 'bar',
                        data: totalDramas,
                        itemStyle: {
                            color: function (params) {
                                const platform = platformNames[params.dataIndex];
                                return app.platformColors[platform];
                            }
                        }
                    },
                    {
                        name: '平均评分',
                        type: 'line',
                        yAxisIndex: 1,
                        data: avgRatings,
                        symbol: 'circle',
                        symbolSize: 8,
                        lineStyle: {
                            width: 3
                        }
                    },
                    {
                        name: '用户基数(百万)',
                        type: 'bar',
                        data: userBase,
                        itemStyle: {
                            color: function (params) {
                                const platform = platformNames[params.dataIndex];
                                return app.platformColors[platform] + '80'; // 添加透明度
                            }
                        }
                    }
                ]
            };

            this.charts.platformCompetition.setOption(option);
        },

        // 类型分布图表
        initGenreDistributionChart() {
            const chartDom = document.getElementById('genreDistributionChart');
            if (!chartDom) return;

            this.charts.genreDistribution = echarts.init(chartDom);

            // 计算各类型剧集数量
            const genreCounts = {};
            [...this.dramaData, ...this.shortDramaData].forEach(drama => {
                if (!genreCounts[drama.genre]) {
                    genreCounts[drama.genre] = 0;
                }
                genreCounts[drama.genre]++;
            });

            const data = Object.keys(genreCounts).map(genre => ({
                name: genre,
                value: genreCounts[genre],
                itemStyle: {
                    color: this.genreColors[genre] || '#999'
                }
            }));

            const option = {
                tooltip: {
                    trigger: 'item',
                    formatter: '{a} <br/>{b}: {c} ({d}%)'
                },
                legend: {
                    orient: 'vertical',
                    right: 10,
                    top: 'center',
                    data: Object.keys(genreCounts)
                },
                series: [
                    {
                        name: '类型分布',
                        type: 'pie',
                        radius: ['40%', '70%'],
                        avoidLabelOverlap: false,
                        label: {
                            show: false,
                            position: 'center'
                        },
                        emphasis: {
                            label: {
                                show: true,
                                fontSize: '18',
                                fontWeight: 'bold'
                            }
                        },
                        labelLine: {
                            show: false
                        },
                        data: data
                    }
                ]
            };

            this.charts.genreDistribution.setOption(option);
        },

        // AI使用率图表
        initAiUsageByPlatformChart() {
            const chartDom = document.getElementById('aiUsageByPlatformChart');
            if (!chartDom) return;

            this.charts.aiUsageByPlatform = echarts.init(chartDom);

            const platformNames = this.platformData.map(p => p.name);
            const scriptwritingRates = this.platformData.map(p => p.ai_scriptwriting_rate);
            const postProductionRates = this.platformData.map(p => p.ai_post_production_rate);

            const option = {
                tooltip: {
                    trigger: 'axis',
                    axisPointer: {
                        type: 'shadow'
                    }
                },
                legend: {
                    data: ['AI剧本创作', 'AI后期制作']
                },
                grid: {
                    left: '3%',
                    right: '4%',
                    bottom: '3%',
                    containLabel: true
                },
                xAxis: {
                    type: 'value',
                    boundaryGap: [0, 0.01],
                    axisLabel: {
                        formatter: '{value}%'
                    }
                },
                yAxis: {
                    type: 'category',
                    data: platformNames
                },
                series: [
                    {
                        name: 'AI剧本创作',
                        type: 'bar',
                        data: scriptwritingRates,
                        itemStyle: {
                            color: '#3498db'
                        }
                    },
                    {
                        name: 'AI后期制作',
                        type: 'bar',
                        data: postProductionRates,
                        itemStyle: {
                            color: '#2ecc71'
                        }
                    }
                ]
            };

            this.charts.aiUsageByPlatform.setOption(option);
        },

        // 审查通过率图表
        initCensorshipByGenreChart() {
            const chartDom = document.getElementById('censorshipByGenreChart');
            if (!chartDom) return;

            this.charts.censorshipByGenre = echarts.init(chartDom);

            const genres = this.censorshipData.map(item => item.genre);
            const approvalRates = this.censorshipData.map(item => item.approval_rate);
            const marketReturns = this.censorshipData.map(item => item.market_return);

            const option = {
                tooltip: {
                    trigger: 'axis',
                    axisPointer: {
                        type: 'cross',
                        crossStyle: {
                            color: '#999'
                        }
                    }
                },
                legend: {
                    data: ['审查通过率', '市场回报率']
                },
                xAxis: [
                    {
                        type: 'category',
                        data: genres,
                        axisPointer: {
                            type: 'shadow'
                        },
                        axisLabel: {
                            interval: 0,
                            rotate: 30
                        }
                    }
                ],
                yAxis: [
                    {
                        type: 'value',
                        name: '审查通过率',
                        min: 0,
                        max: 100,
                        interval: 20,
                        axisLabel: {
                            formatter: '{value}%'
                        }
                    },
                    {
                        type: 'value',
                        name: '市场回报率',
                        min: 0,
                        max: 5,
                        interval: 1,
                        axisLabel: {
                            formatter: '{value}'
                        }
                    }
                ],
                series: [
                    {
                        name: '审查通过率',
                        type: 'bar',
                        data: approvalRates,
                        itemStyle: {
                            color: function (params) {
                                const genre = genres[params.dataIndex];
                                return app.genreColors[genre] || '#999';
                            }
                        }
                    },
                    {
                        name: '市场回报率',
                        type: 'line',
                        yAxisIndex: 1,
                        data: marketReturns,
                        symbol: 'diamond',
                        symbolSize: 10,
                        lineStyle: {
                            width: 3,
                            color: '#e74c3c'
                        },
                        itemStyle: {
                            color: '#e74c3c'
                        }
                    }
                ]
            };

            this.charts.censorshipByGenre.setOption(option);
        },

        // 用户人口统计图表
        initUserDemographicsChart() {
            const chartDom = document.getElementById('userDemographicsChart');
            if (!chartDom) return;

            this.charts.userDemographics = echarts.init(chartDom);

            const ageGroups = Object.keys(this.userBehaviorData.demographic_insights.age_distribution);
            const agePercentages = ageGroups.map(age => this.userBehaviorData.demographic_insights.age_distribution[age].percentage * 100);

            const genderData = [
                {
                    name: '女性',
                    value: this.userBehaviorData.demographic_insights.gender_distribution.female.percentage * 100
                },
                {
                    name: '男性',
                    value: this.userBehaviorData.demographic_insights.gender_distribution.male.percentage * 100
                }
            ];

            const option = {
                tooltip: {
                    trigger: 'item',
                    formatter: '{a} <br/>{b}: {c}%'
                },
                grid: {
                    top: '10%',
                    bottom: '55%'
                },
                xAxis: {
                    type: 'category',
                    data: ageGroups,
                    axisLabel: {
                        interval: 0
                    }
                },
                yAxis: {
                    type: 'value',
                    axisLabel: {
                        formatter: '{value}%'
                    }
                },
                series: [
                    {
                        name: '年龄分布',
                        type: 'bar',
                        data: agePercentages,
                        itemStyle: {
                            color: function (params) {
                                const colors = ['#3498db', '#2ecc71', '#e67e22', '#9b59b6'];
                                return colors[params.dataIndex % colors.length];
                            }
                        }
                    },
                    {
                        name: '性别分布',
                        type: 'pie',
                        radius: ['30%', '50%'],
                        center: ['50%', '75%'],
                        data: genderData,
                        itemStyle: {
                            color: function (params) {
                                return params.name === '女性' ? '#e84393' : '#0984e3';
                            }
                        },
                        label: {
                            formatter: '{b}: {c}%'
                        }
                    }
                ]
            };

            this.charts.userDemographics.setOption(option);
        },

        // 观看趋势图表
        initViewingTrendsChart() {
            const chartDom = document.getElementById('viewingTrendsChart');
            if (!chartDom) return;

            this.charts.viewingTrends = echarts.init(chartDom);

            const weekdayTimes = ['morning', 'afternoon', 'evening', 'night'];
            const weekdayData = weekdayTimes.map(time => this.userBehaviorData.viewing_patterns.peak_viewing_times.weekdays[time] * 100);
            const weekendData = weekdayTimes.map(time => this.userBehaviorData.viewing_patterns.peak_viewing_times.weekends[time] * 100);

            const option = {
                tooltip: {
                    trigger: 'axis',
                    axisPointer: {
                        type: 'shadow'
                    }
                },
                legend: {
                    data: ['工作日', '周末']
                },
                grid: {
                    left: '3%',
                    right: '4%',
                    bottom: '3%',
                    containLabel: true
                },
                xAxis: {
                    type: 'category',
                    data: ['早晨', '下午', '晚上', '深夜']
                },
                yAxis: {
                    type: 'value',
                    axisLabel: {
                        formatter: '{value}%'
                    }
                },
                series: [
                    {
                        name: '工作日',
                        type: 'bar',
                        data: weekdayData,
                        itemStyle: {
                            color: '#3498db'
                        }
                    },
                    {
                        name: '周末',
                        type: 'bar',
                        data: weekendData,
                        itemStyle: {
                            color: '#e74c3c'
                        }
                    }
                ]
            };

            this.charts.viewingTrends.setOption(option);
        },

        // AI效果图表
        initAiEffectivenessChart() {
            const chartDom = document.getElementById('aiEffectivenessChart');
            if (!chartDom) return;

            this.charts.aiEffectiveness = echarts.init(chartDom);

            // 提取AI应用类型和成功率
            const aiTypes = this.aiApplicationData.map(item => item.application_type);
            const successRates = this.aiApplicationData.map(item => item.success_rate);
            const costReductions = this.aiApplicationData.map(item => item.cost_reduction_percentage);

            const option = {
                tooltip: {
                    trigger: 'axis',
                    axisPointer: {
                        type: 'cross',
                        crossStyle: {
                            color: '#999'
                        }
                    }
                },
                legend: {
                    data: ['成功率', '成本节约']
                },
                xAxis: [
                    {
                        type: 'category',
                        data: aiTypes,
                        axisPointer: {
                            type: 'shadow'
                        },
                        axisLabel: {
                            interval: 0,
                            rotate: 30
                        }
                    }
                ],
                yAxis: [
                    {
                        type: 'value',
                        name: '成功率',
                        min: 0,
                        max: 100,
                        interval: 20,
                        axisLabel: {
                            formatter: '{value}%'
                        }
                    },
                    {
                        type: 'value',
                        name: '成本节约',
                        min: 0,
                        max: 100,
                        interval: 20,
                        axisLabel: {
                            formatter: '{value}%'
                        }
                    }
                ],
                series: [
                    {
                        name: '成功率',
                        type: 'bar',
                        data: successRates,
                        itemStyle: {
                            color: '#3498db'
                        }
                    },
                    {
                        name: '成本节约',
                        type: 'line',
                        yAxisIndex: 1,
                        data: costReductions,
                        symbol: 'circle',
                        symbolSize: 8,
                        lineStyle: {
                            width: 3,
                            color: '#2ecc71'
                        },
                        itemStyle: {
                            color: '#2ecc71'
                        }
                    }
                ]
            };

            this.charts.aiEffectiveness.setOption(option);
        },

        // 市场回报图表
        initMarketReturnsChart() {
            const chartDom = document.getElementById('marketReturnsChart');
            if (!chartDom) return;

            this.charts.marketReturns = echarts.init(chartDom);

            // 提取类型、审查通过率和市场回报率
            const genres = this.censorshipData.map(item => item.genre);
            const approvalRates = this.censorshipData.map(item => item.approval_rate);
            const marketReturns = this.censorshipData.map(item => item.market_return);
            const riskFactors = this.censorshipData.map(item => item.risk_factor);

            const data = genres.map((genre, index) => ({
                name: genre,
                value: [approvalRates[index], marketReturns[index], riskFactors[index] * 20, genre],
                itemStyle: {
                    color: this.genreColors[genre] || '#999'
                }
            }));

            const option = {
                tooltip: {
                    formatter: function (params) {
                        return params.data.name + '<br/>' +
                            '审查通过率: ' + params.data.value[0] + '%<br/>' +
                            '市场回报率: ' + params.data.value[1] + '<br/>' +
                            '风险因子: ' + (params.data.value[2] / 20).toFixed(1);
                    }
                },
                xAxis: {
                    type: 'value',
                    name: '审查通过率',
                    axisLabel: {
                        formatter: '{value}%'
                    }
                },
                yAxis: {
                    type: 'value',
                    name: '市场回报率'
                },
                series: [
                    {
                        name: '市场回报与风险',
                        type: 'scatter',
                        symbolSize: function (data) {
                            return data[2];
                        },
                        data: data,
                        label: {
                            show: true,
                            formatter: function (param) {
                                return param.data.value[3];
                            },
                            position: 'top'
                        },
                        emphasis: {
                            label: {
                                show: true,
                                fontWeight: 'bold',
                                fontSize: 14
                            }
                        }
                    }
                ]
            };

            this.charts.marketReturns.setOption(option);
        },

        // 设置当前视图
        setView(view) {
            this.currentView = view;

            // 更新图表大小
            this.$nextTick(() => {
                for (const chart in this.charts) {
                    if (this.charts[chart]) {
                        this.charts[chart].resize();
                    }
                }
            });
        },

        // 显示剧集详情
        showDramaDetails(drama) {
            this.selectedDrama = drama;
            $('#dramaDetailModal').modal('show');
        },

        // 导出报告为PDF
        exportReport() {
            window.print();
        }
    },
    mounted() {
        this.loadAllData();
        this.aiStats();  // 在 mounted 生命周期钩子中调用 aiStats 方法
        // 响应窗口大小变化
        window.addEventListener('resize', () => {
            for (const chart in this.charts) {
                if (this.charts[chart]) {
                    this.charts[chart].resize();
                }
            }
        });
    }
})

app.use(router)
createApp(App).mount('#app')

