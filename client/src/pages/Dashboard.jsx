import Sidebar from "../components/Sidebar";
import FileUpload from "../components/FileUpload";

const Dashboard = () => {
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-auto">
        <h1 className="text-3xl font-semibold mb-6">Dashboard</h1>

        {/* File Upload Component */}
        <FileUpload />

        {/* Other sections like Sent Files, Received Files */}
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-4">Recent Documents</h2>
          <p className="text-gray-600">No documents uploaded yet.</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
