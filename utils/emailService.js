const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    try {
      // Development: Skip real email sending, just log
      if (process.env.NODE_ENV === 'development') {
        console.log('📧 Email service in development mode - emails will be simulated');
        this.transporter = null; // Set to null to trigger development mode
      } else {
        // Production: Use Gmail or other SMTP service
        this.transporter = nodemailer.createTransporter({
          host: process.env.EMAIL_HOST || 'smtp.gmail.com',
          port: process.env.EMAIL_PORT || 587,
          secure: false,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });
        console.log('📧 Email service initialized with production SMTP');
      }
    } catch (error) {
      console.error('❌ Failed to initialize email service:', error.message);
    }
  }

  async sendPasswordResetEmail(userEmail, userName, resetToken) {
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

      const mailOptions = {
        from: process.env.EMAIL_FROM || 'noreply@safarishare.com',
        to: userEmail,
        subject: 'Password Reset Request - SafariShare',
        html: this.getPasswordResetEmailTemplate(userName, resetUrl, resetToken)
      };

      if (process.env.NODE_ENV === 'development') {
        // In development, log the email content instead of sending
        console.log('📧 Development Mode - Password Reset Email:');
        console.log('To:', userEmail);
        console.log('Reset URL:', resetUrl);
        console.log('Token:', resetToken);
        console.log('---');
        
        return {
          success: true,
          messageId: 'dev-mode-' + Date.now(),
          resetUrl: resetUrl
        };
      }

      const result = await this.transporter.sendMail(mailOptions);
      
      console.log('✅ Password reset email sent to:', userEmail);
      return {
        success: true,
        messageId: result.messageId
      };
      
    } catch (error) {
      console.error('❌ Failed to send password reset email:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  getPasswordResetEmailTemplate(userName, resetUrl, token) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset - SafariShare</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #3B82F6; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { 
            display: inline-block; 
            background: #3B82F6; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 6px; 
            margin: 20px 0;
          }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
          .warning { background: #FEF3C7; border: 1px solid #F59E0B; padding: 15px; border-radius: 6px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚗 SafariShare</h1>
            <p>Password Reset Request</p>
          </div>
          
          <div class="content">
            <h2>Hello ${userName}!</h2>
            
            <p>We received a request to reset your password for your SafariShare account.</p>
            
            <p>Click the button below to reset your password:</p>
            
            <a href="${resetUrl}" class="button">Reset Password</a>
            
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background: #f0f0f0; padding: 10px; border-radius: 4px;">
              ${resetUrl}
            </p>
            
            <div class="warning">
              <strong>⚠️ Important Security Information:</strong>
              <ul>
                <li>This link will expire in <strong>10 minutes</strong></li>
                <li>If you didn't request this reset, you can safely ignore this email</li>
                <li>Never share this link with anyone</li>
                <li>For security, we recommend changing your password regularly</li>
              </ul>
            </div>
            
            <p>If you're having trouble with the button above, you can also reset your password by:</p>
            <ol>
              <li>Going to the SafariShare login page</li>
              <li>Clicking "Forgot Password"</li>
              <li>Entering this reset code: <strong>${token.substr(0, 8)}...${token.substr(-8)}</strong></li>
            </ol>
          </div>
          
          <div class="footer">
            <p>This email was sent by SafariShare. If you have any questions, please contact our support team.</p>
            <p>© ${new Date().getFullYear()} SafariShare. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  async sendWelcomeEmail(userEmail, userName) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || 'noreply@safarishare.com',
        to: userEmail,
        subject: 'Welcome to SafariShare! 🚗',
        html: this.getWelcomeEmailTemplate(userName)
      };

      if (process.env.NODE_ENV === 'development') {
        console.log('📧 Development Mode - Welcome Email would be sent to:', userEmail);
        return { success: true, messageId: 'dev-welcome-' + Date.now() };
      }

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Welcome email sent to:', userEmail);
      
      return {
        success: true,
        messageId: result.messageId
      };
      
    } catch (error) {
      console.error('❌ Failed to send welcome email:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  getWelcomeEmailTemplate(userName) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to SafariShare</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #3B82F6; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { 
            display: inline-block; 
            background: #3B82F6; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 6px; 
            margin: 20px 0;
          }
          .features { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; }
          .feature { margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚗 Welcome to SafariShare!</h1>
            <p>Your ride-sharing journey begins now</p>
          </div>
          
          <div class="content">
            <h2>Hello ${userName}! 👋</h2>
            
            <p>Thank you for joining SafariShare! We're excited to have you as part of our community.</p>
            
            <div class="features">
              <h3>What you can do with SafariShare:</h3>
              <div class="feature">🚗 <strong>Book Rides:</strong> Find comfortable rides to your destination</div>
              <div class="feature">🎯 <strong>Offer Rides:</strong> Share your car and earn money</div>
              <div class="feature">💬 <strong>Connect:</strong> Chat with drivers and passengers</div>
              <div class="feature">⭐ <strong>Rate & Review:</strong> Build trust in our community</div>
              <div class="feature">🛡️ <strong>Stay Safe:</strong> Verified profiles and secure payments</div>
            </div>
            
            <p style="text-align: center;">
              <a href="${frontendUrl}" class="button">Start Using SafariShare</a>
            </p>
            
            <p>If you have any questions or need help getting started, don't hesitate to reach out to our support team.</p>
            
            <p>Happy travels!</p>
            <p><strong>The SafariShare Team</strong></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

module.exports = new EmailService();
