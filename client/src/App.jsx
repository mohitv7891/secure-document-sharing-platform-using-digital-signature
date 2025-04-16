// OR if your Routes are directly in App.jsx:
/* === File: src/App.jsx === */
 import React from 'react';
 import { Routes, Route } from 'react-router-dom';
 import { AuthProvider } from './context/AuthContext'; // Import here if wrapping Routes
 import Login from './pages/Login';
 import Register from './pages/Register';
 import Dashboard from './pages/Dashboard';
 import Navbar from './components/Navbar';
 import Home from './pages/Home';
// // ... other imports

 function App() {
   return (
      <AuthProvider>
       <Routes>
       <Route path="/" element={<Home />} />
         <Route path="/login" element={<Login />} />
         <Route path="/register" element={<Register />} />
        {/* Add ProtectedRoute component later if needed */}
        <Route path="/dashboard" element={<Dashboard />} />
        {/* ... other routes */}
      </Routes>
     </AuthProvider>
   );
   }
 export default App;