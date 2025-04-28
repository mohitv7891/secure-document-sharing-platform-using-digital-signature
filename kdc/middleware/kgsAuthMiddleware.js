// kgs/middleware/kgsAuthMiddleware.js
const jwt = require('jsonwebtoken');

// Middleware 1: Authenticate the end-user via forwarded JWT
const authenticateUserJwt = (req, res, next) => {
     console.log("KGS: authenticateUserJwt middleware running...");
     const userJwt = req.body.userJwt; // Expect JWT in request body
     const JWT_SECRET = process.env.JWT_SECRET; // Get shared JWT secret

     const functionName = "KDC:authenticateUserJwt"; // For easier log searching
     console.log(`--- ${functionName}: Middleware running... ---`);

     // --- ADD/VERIFY THIS LOG ---
     console.log(`${functionName} - Received req.body:`, req.body);
     // --- END LOG ---

     if (!userJwt) {
         console.warn("KGS: User JWT missing in request body.");
         return res.status(401).json({ message: 'User authentication token missing.' });
     }
     if (!JWT_SECRET) {
         console.error("KGS FATAL: JWT_SECRET not configured on KGS!");
         return res.status(500).json({ message: 'Server configuration error [JWT Secret].' });
     }

     try {
        const decoded = jwt.verify(userJwt, JWT_SECRET);
        if (!decoded || !decoded.user || !decoded.user.id || !decoded.user.email) {
             console.warn('KGS: Invalid user JWT payload structure:', decoded);
             return res.status(401).json({ message: 'User token payload invalid.' });
        }
        // Attach user info to request for the controller
        req.user = decoded.user;
      //  console.log(`KGS: User JWT verified successfully for user: ${req.user.email}`);
        console.log(`${functionName}: User JWT verified successfully. Attached user: ${JSON.stringify(req.user)}`);
        
        next();
     } catch (err) {
         console.warn('KGS: User JWT verification failed:', err.name, err.message);
          if (err.name === 'TokenExpiredError') {
             return res.status(401).json({ message: 'User authentication token has expired.' });
         }
         return res.status(401).json({ message: 'User authentication token is not valid.' });
     }
};

module.exports = {authenticateUserJwt };