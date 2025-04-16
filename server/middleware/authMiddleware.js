const jwt = require('jsonwebtoken');
const User = require('../models/user'); // Optional: if you need to check if user still exists

const JWT_SECRET = process.env.JWT_SECRET;

module.exports = function (req, res, next) {
    // Get token from header
    const token = req.header('Authorization'); // Expecting "Bearer <token>"

    // Check if no token
    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    // Verify token
    try {
         // Extract token from "Bearer <token>" format
         const actualToken = token.split(' ')[1];
         if (!actualToken) {
             return res.status(401).json({ message: 'Token format is invalid' });
         }

        const decoded = jwt.verify(actualToken, JWT_SECRET);

        // Attach user ID to the request object
        req.user = decoded.user; // Contains { id: userId } from payload
        console.log(`Auth middleware: Token verified for user ID ${req.user.id}`);
        next(); // Proceed to the next middleware/route handler
    } catch (err) {
        console.error('Auth middleware error:', err.message);
        res.status(401).json({ message: 'Token is not valid' });
    }
};