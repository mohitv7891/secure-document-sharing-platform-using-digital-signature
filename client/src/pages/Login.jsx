import React, { useState, useContext } from 'react'; // Import useContext
// import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Navbar from "../components/Navbar";
import { useAuth } from '../context/AuthContext'; // Import the useAuth hook

//const API_BASE_URL = "http://localhost:5006";
const Login = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const navigate = useNavigate();
  const { login, apiClient } = useAuth(); // <-- Get login and apiClient
  const { email, password } = formData;

  const onChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrorMessage('');
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    if (!email || !password) {
      setErrorMessage('Please enter both email and password.');
      setIsLoading(false);
      return;
    }

    const userCredentials = { email, password };

    try {
      const config = { headers: { 'Content-Type': 'application/json' } };
      const body = JSON.stringify(userCredentials);
      // const res = await axios.post(`${API_BASE_URL}/api/auth/login`, body, config);
      //const res = await apiClient.post(`/auth/login`, body,config);
      const res = await apiClient.post('/auth/login', userCredentials);

      if (res.data.token) {
        // Use the login function from context instead of directly setting localStorage
        login(res.data.token);
        console.log('Login successful, context updated.');
        navigate('/dashboard'); // Redirect to dashboard
      } else {
        setErrorMessage('Login successful, but no token received.');
      }

    } catch (err) {
      console.error('Login Error:', err.response ? err.response.data : err.message);
      const errorMsg = err.response?.data?.message || 'Login failed. Please check your credentials.';
      setErrorMessage(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // --- JSX remains largely the same as before ---
  return (
    <div>
      <Navbar />
      <div className="flex justify-center items-center min-h-screen pt-16">
        <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-center text-gray-800">Login</h2>
          {errorMessage && ( <div className="p-3 rounded text-center text-sm bg-red-100 text-red-700"> {errorMessage} </div> )}
          <form onSubmit={onSubmit} className="space-y-4">
             <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">IIITA Email</label>
               <input type="email" id="email" placeholder="user@iiita.ac.in" name="email" value={email} onChange={onChange} required className="w-full p-2 mt-1 border rounded-md focus:ring-blue-500 focus:border-blue-500" />
            </div>
             <div>
               <label htmlFor="password"className="block text-sm font-medium text-gray-700">Password</label>
               <input type="password" id="password" placeholder="Password" name="password" value={password} onChange={onChange} required className="w-full p-2 mt-1 border rounded-md focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <button type="submit" disabled={isLoading} className={`w-full p-2 rounded-md text-white font-semibold ${ isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700' }`} >
              {isLoading ? 'Logging In...' : 'Login'}
            </button>
          </form>
           <p className="text-sm text-center text-gray-600">
                Don't have an account?{' '}
                <button onClick={() => navigate('/register')} className="font-medium text-blue-600 hover:underline">
                    Sign Up
                </button>
            </p>
        </div>
      </div>
    </div>
  );
};

export default Login;