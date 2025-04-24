// client/pages/Register.jsx
import React, { useState } from 'react';
import axios from 'axios'; // Assuming you use axios
import { useNavigate, Link } from 'react-router-dom';
import Navbar from "../components/Navbar"; // Assuming Navbar exists

// Configure your API base URL centrally if possible
const API_BASE_URL = 'https://secure-docs-api.onrender.com'; // Adjust if needed

const Register = () => {
  // State for different stages: 'enterDetails', 'enterOtp'
  const [stage, setStage] = useState('enterDetails');

  // Form data state
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [otp, setOtp] = useState('');

  // State for tracking submitted email (needed for OTP verification)
  const [submittedEmail, setSubmittedEmail] = useState('');

  // UI feedback state
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(''); // General messages (success/info)
  const [errorMessage, setErrorMessage] = useState(''); // Error messages

  const navigate = useNavigate();

  const { name, email, password } = formData;

  // Handle changes for initial details form
  const onChangeDetails = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setMessage(''); // Clear messages on input change
    setErrorMessage('');
  };

  // Handle changes for OTP input
  const onChangeOtp = (e) => {
    setOtp(e.target.value);
    setMessage(''); // Clear messages on input change
    setErrorMessage('');
  };

  // --- Handler for Step 1: Submitting Details to Initiate ---
  const handleSubmitDetails = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    setErrorMessage('');

    if (!email || !password) {
      setErrorMessage('Please enter email and password.');
      setIsLoading(false);
      return;
    }
     if (!email.toLowerCase().endsWith('@iiita.ac.in')) {
        setErrorMessage('Please use a valid IIITA email address (@iiita.ac.in).');
        setIsLoading(false);
        return;
     }
     if (password.length < 6) {
        setErrorMessage('Password must be at least 6 characters.');
        setIsLoading(false);
        return;
     }


    try {
      const config = { headers: { 'Content-Type': 'application/json' } };
      const body = JSON.stringify({ name, email, password });

      // Call the NEW initiate endpoint
      const res = await axios.post(`${API_BASE_URL}/api/auth/initiate-registration`, body, config);

      // Success: Move to OTP stage
      setMessage(res.data.message || 'OTP Sent! Check your email.'); // Show success message from backend
      setSubmittedEmail(email); // Store email for verification step
      setStage('enterOtp'); // Change stage
      setFormData({ ...formData, password: '' }); // Clear password field for security
      setOtp(''); // Clear any previous OTP input

    } catch (err) {
      console.error('Initiate Registration Error:', err.response ? err.response.data : err.message);
      const errorMsg = err.response?.data?.message || // Use backend message first
                       err.response?.data?.errors?.[0]?.msg || // Use validator message if available
                       'Registration initiation failed. Please try again.';
      setErrorMessage(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Handler for Step 2: Submitting OTP to Verify ---
  const handleSubmitOtp = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    setErrorMessage('');

    if (!otp || otp.length !== 6 || !/^\d+$/.test(otp)) {
      setErrorMessage('Please enter a valid 6-digit OTP.');
      setIsLoading(false);
      return;
    }

    try {
      const config = { headers: { 'Content-Type': 'application/json' } };
      // Send the original submitted email and the entered OTP
      const body = JSON.stringify({ email: submittedEmail, otp });

      // Call the NEW verify endpoint
      const res = await axios.post(`${API_BASE_URL}/api/auth/verify-registration`, body, config);

      // Success: Registration Complete
      setMessage(res.data.message || 'Registration successful!'); // Show success message
      // Redirect to login page after a short delay
      setTimeout(() => {
        navigate('/login');
      }, 2000); // Redirect after 2 seconds

    } catch (err) {
      console.error('Verify Registration Error:', err.response ? err.response.data : err.message);
      const errorMsg = err.response?.data?.message || // Use backend message first
                       err.response?.data?.errors?.[0]?.msg || // Use validator message if available
                       'OTP verification failed. Please check the code or try initiating again.';
      setErrorMessage(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Go back from OTP stage ---
  const handleGoBack = () => {
      setStage('enterDetails');
      setErrorMessage('');
      setMessage('');
      setOtp('');
      setSubmittedEmail('');
      // Optionally clear name/email fields too, or keep them
      // setFormData({ name: '', email: '', password: '' });
  };


  // --- Render Logic ---
  return (
    <div>
      <Navbar />
      <div className="flex justify-center items-center min-h-screen pt-16">
        <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">

          {/* Stage 1: Enter Details */}
          {stage === 'enterDetails' && (
            <>
              <h2 className="text-2xl font-bold text-center text-gray-800">Register</h2>
              {message && ( <div className="p-3 rounded text-center text-sm bg-green-100 text-green-700"> {message} </div> )}
              {errorMessage && ( <div className="p-3 rounded text-center text-sm bg-red-100 text-red-700"> {errorMessage} </div> )}
              <form onSubmit={handleSubmitDetails} className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name (Optional)</label>
                  <input type="text" id="name" placeholder="Your Name" name="name" value={name} onChange={onChangeDetails} className="w-full p-2 mt-1 border rounded-md focus:ring-blue-500 focus:border-blue-500"/>
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">IIITA Email</label>
                  <input type="email" id="email" placeholder="user@iiita.ac.in" name="email" value={email} onChange={onChangeDetails} required className="w-full p-2 mt-1 border rounded-md focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label htmlFor="password"className="block text-sm font-medium text-gray-700">Password (min 6 chars)</label>
                  <input type="password" id="password" placeholder="Password" name="password" value={password} onChange={onChangeDetails} required className="w-full p-2 mt-1 border rounded-md focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <button type="submit" disabled={isLoading} className={`w-full p-2 rounded-md text-white font-semibold ${ isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700' }`} >
                  {isLoading ? 'Sending OTP...' : 'Register & Send OTP'}
                </button>
              </form>
               <p className="text-sm text-center text-gray-600">
                   Already have an account?{' '}
                   <Link to="/login" className="font-medium text-blue-600 hover:underline">
                       Log In
                   </Link>
               </p>
            </>
          )}

          {/* Stage 2: Enter OTP */}
          {stage === 'enterOtp' && (
             <>
              <h2 className="text-2xl font-bold text-center text-gray-800">Verify Email</h2>
              {message && ( <div className="p-3 rounded text-center text-sm bg-green-100 text-green-700"> {message} </div> )}
              {errorMessage && ( <div className="p-3 rounded text-center text-sm bg-red-100 text-red-700"> {errorMessage} </div> )}

              <p className="text-sm text-center text-gray-600">
                An OTP has been sent to <strong>{submittedEmail}</strong>. Please enter it below. It expires in 10 minutes.
              </p>

              <form onSubmit={handleSubmitOtp} className="space-y-4">
                <div>
                  <label htmlFor="otp" className="block text-sm font-medium text-gray-700">Enter 6-Digit OTP</label>
                  <input type="text" id="otp" placeholder="123456" name="otp" value={otp} onChange={onChangeOtp} maxLength="6" required className="w-full p-2 mt-1 border rounded-md focus:ring-blue-500 focus:border-blue-500 tracking-widest text-center" />
                </div>

                <button type="submit" disabled={isLoading} className={`w-full p-2 rounded-md text-white font-semibold ${ isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700' }`} >
                  {isLoading ? 'Verifying...' : 'Verify OTP & Complete Registration'}
                </button>
              </form>
               <button onClick={handleGoBack} disabled={isLoading} className="w-full text-sm text-center text-gray-600 hover:underline mt-2 disabled:text-gray-400">
                  Go Back / Change Email
               </button>
               {/* Optional: Add Resend OTP button here if needed */}
            </>
          )}

        </div>
      </div>
    </div>
  );
};

export default Register;