import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { CreateRoom } from "./components/CreateRoom";
import { Room } from "./components/Room";
import { Admin } from "./components/Admin";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<CreateRoom />} />
        <Route path="/room/:code" element={<Room />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </Router>
  );
}

export default App;
