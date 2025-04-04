import { Link } from "react-router-dom";

const Navbar = () => {
  return (
    <nav className="bg-gray-900 text-white fixed w-full top-0 left-0 shadow-lg z-50">
      <div className="max-w-screen-xl mx-auto px-6 flex justify-between items-center py-4">
        {/* Logo */}
        <h1 className="text-2xl font-extrabold tracking-wide">
          SecureDocs
        </h1>

        {/* Navigation Links */}
        <div className="hidden md:flex space-x-6">
          <Link to="/" className="hover:text-gray-300 transition">Home</Link>
          <Link to="/about" className="hover:text-gray-300 transition">About</Link>
          <Link to="/contact" className="hover:text-gray-300 transition">Contact</Link>
        </div>

        {/* Login & Signup Buttons */}
        <div className="space-x-4">
          <Link to="/login" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg">
            Login
          </Link>
          <Link to="/signup" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg">
            Signup
          </Link>
          <Link to="/dashboard" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg">
            Dashboard
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
