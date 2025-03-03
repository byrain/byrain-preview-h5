// import VotePreviewTool from './components/VotePreviewTool'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';

function App() {
  return (
    <Router>
      <a href="https://download.samplelib.com/mp4/sample-5s.mp4">测试工具集合</a>

      <div>
        <Routes>
          <Route path="/" element={
            <h1 >
              <Link to="/vote-preview">
                投票预览工具
              </Link>
            </h1>
          } />

          <Route path="/vote-preview" element={
            <>
              <h1 className="text-3xl font-bold mb-8">
                <Link to="/" className="hover:text-blue-600 cursor-pointer">
                  投票预览工具
                </Link>
              </h1>
              {/* <VotePreviewTool /> */}
            </>
          } />
        </Routes>
      </div>
    </Router>
  )
}

export default App
