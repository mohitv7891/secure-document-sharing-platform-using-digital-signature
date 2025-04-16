import React, { useState } from 'react'; // Import useState
import axios from 'axios'; // Import axios for API calls
import { useNavigate } from 'react-router-dom'; // Import for navigation
import Navbar from "../components/Navbar"; // Assuming Navbar exists

const Register = () => {
  // State for form inputs
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });
  // State for loading indication
  const [isLoading, setIsLoading] = useState(false);
  // State for success/error messages
  const [message, setMessage] = useState({ type: '', text: '' }); // type can be 'success' or 'error'

  const navigate = useNavigate(); // Hook for navigation

  // Destructure form data for easier access
  const { name, email, password } = formData;

  // Handle input changes
  const onChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setMessage({ type: '', text: '' }); // Clear message on input change
  };

  // Handle form submission
  const onSubmit = async (e) => {
    e.preventDefault(); // Prevent default form submission
    setIsLoading(true);
    setMessage({ type: '', text: '' }); // Clear previous messages

    // Basic validation (optional, backend validation is primary)
    if (!email || !password) {
      setMessage({ type: 'error', text: 'Email and password are required.' });
      setIsLoading(false);
      return;
    }
     if (!email.toLowerCase().endsWith('@iiita.ac.in')) { // Simple domain check on client
       setMessage({ type: 'error', text: 'Please use a valid IIITA email address.' });
       setIsLoading(false);
       return;
     }
     if (password.length < 6) {
        setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
        setIsLoading(false);
        return;
     }

    // Prepare data payload for API
    const newUser = {
      name, // Include name if your backend uses it
      email,
      password,
    };

    try {
      // Make POST request to backend registration endpoint
      const config = {
        headers: {
          'Content-Type': 'application/json',
        },
      };
      const body = JSON.stringify(newUser);

      // Replace with your actual backend URL if different
      const res = await axios.post('http://localhost:5006/api/auth/register', body, config);

      console.log('Registration Response:', res.data);
      setMessage({ type: 'success', text: res.data.message || 'Registration successful! Redirecting to login...' });

      // Clear form (optional)
      setFormData({ name: '', email: '', password: '' });

      // Redirect to login page after a short delay
      setTimeout(() => {
        navigate('/login'); // Navigate to the login route
      }, 2000); // 2 second delay

    } catch (err) {
      console.error('Registration Error:', err.response ? err.response.data : err.message);
      // Display error message from backend response if available
      const errorMsg = err.response?.data?.message || err.response?.data?.errors?.[0]?.msg || 'Registration failed. Please try again.';
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setIsLoading(false); // Stop loading indicator
    }
  };

  return (
    <div>
      <Navbar />
      <div className="flex justify-center items-center min-h-screen pt-16"> {/* Added padding-top */}
        <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-center text-gray-800">Create Account</h2>

          {/* Display Messages */}
          {message.text && (
            <div className={`p-3 rounded text-center text-sm ${
              message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {message.text}
            </div>
          )}

          {/* Registration Form */}
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">Full Name (Optional)</label>
              <input
                type="text"
                id="name"
                placeholder="Your Name"
                name="name" // Add name attribute
                value={name}
                onChange={onChange}
                className="w-full p-2 mt-1 border rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
             <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">IIITA Email</label>
               <input
                 type="email"
                 id="email"
                 placeholder="user@iiita.ac.in"
                 name="email" // Add name attribute
                 value={email}
                 onChange={onChange}
                 required // Add basic required validation
                 className="w-full p-2 mt-1 border rounded-md focus:ring-blue-500 focus:border-blue-500"
               />
            </div>
             <div>
               <label htmlFor="password"className="block text-sm font-medium text-gray-700">Password</label>
               <input
                 type="password"
                 id="password"
                 placeholder="Password (min. 6 characters)"
                 name="password" // Add name attribute
                 value={password}
                 onChange={onChange}
                 required // Add basic required validation
                 minLength="6" // Add basic length validation
                 className="w-full p-2 mt-1 border rounded-md focus:ring-blue-500 focus:border-blue-500"
               />
            </div>
            <button
              type="submit"
              disabled={isLoading} // Disable button while loading
              className={`w-full p-2 rounded-md text-white font-semibold ${
                isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Register; // Export as Register

