import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { CreateRoom } from "./components/CreateRoom";
import { Room } from "./components/Room";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<CreateRoom />} />
        <Route path="/room/:code" element={<Room />} />
      </Routes>
    </Router>
  );
}

export default App;
