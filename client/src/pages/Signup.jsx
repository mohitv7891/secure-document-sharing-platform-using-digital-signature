import Navbar from "../components/Navbar";

const Signup = () => {
  return (
    <div>
      <Navbar />
      <div className="flex justify-center items-center h-screen">
        <div className="w-96 p-6 shadow-lg bg-white rounded-md">
          <h2 className="text-2xl font-bold text-gray-800 text-center mb-4">Sign Up</h2>
          <input type="text" placeholder="Full Name" className="w-full p-2 border rounded-md mb-3" />
          <input type="email" placeholder="Email" className="w-full p-2 border rounded-md mb-3" />
          <input type="password" placeholder="Password" className="w-full p-2 border rounded-md mb-3" />
          <button className="w-full bg-blue-600 text-white p-2 rounded-md">Create Account</button>
        </div>
      </div>
    </div>
  );
};

export default Signup;
