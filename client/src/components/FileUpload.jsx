import { useState } from "react";
import axios from "axios";

const FileUpload = () => {
  const [file, setFile] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) {
      alert("Please select a file.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await axios.post("http://localhost:5006/api/files/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      alert(response.data.message);
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Upload failed!");
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-lg font-semibold mb-4">Upload Document</h2>
      <input type="file" onChange={handleFileChange} className="border border-gray-300 p-2 rounded w-full mb-4" />
      <button onClick={handleUpload} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-500">
        Upload
      </button>
    </div>
  );
};

export default FileUpload;
