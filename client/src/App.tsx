import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./hooks/useTheme";
import { CreateRoom } from "./components/CreateRoom";
import { Room } from "./components/Room";
import { Admin } from "./components/Admin";
import { ErrorBoundary } from "./components/ErrorBoundary";

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Router>
          <Routes>
            <Route path="/" element={<CreateRoom />} />
            <Route path="/room/:code" element={<Room />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </Router>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
