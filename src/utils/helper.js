import nodemailer from "nodemailer";
import dotenv from "dotenv";


dotenv.config();


const transporter = nodemailer.createTransport({
  host: "smtp.hostinger.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASSWORD,
  },
});

transporter.verify()
  .then(() => console.log("SMTP connection successful"))
  .catch((err) => console.error("SMTP connection failed:", err));


export const generateOtp = () => {
  const otp = Math.floor(100000 + Math.random() * 900000);
  return otp;
};

export const sendPassMail = async (otp, user) => {
  const mailOptions = {
    from: `"Ancestropedia Team" <${process.env.EMAIL}>`,
    to: user.email,
    subject: "Your Ancestropedia Password Reset OTP",
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img 
            src="https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=294,fit=crop,q=95/mjE7lpywOyIq5zKx/ancestropedia-1-mePx4pQ230uGow26.png" 
            alt="Ancestropedia Logo" 
            style="width: 100px; height: 100px; object-fit: cover; border-radius: 50%;" 
          />
        </div>

        <h2 style="text-align: center; color: #007BFF;">Password Reset Request</h2>

        <p>Hello ${user.firstName || "User"},</p>

        <p>We received a request to reset your password for your Ancestropedia account.</p>

        <p>Please use the following One-Time Password (OTP) to reset your password:</p>

        <div style="text-align: center; margin: 30px 0;">
          <span style="
            font-size: 28px;
            letter-spacing: 6px;
            font-weight: bold;
            color: #222;
            background-color: #f0f0f0;
            padding: 12px 24px;
            border-radius: 8px;
            display: inline-block;
          ">
            ${otp}
          </span>
        </div>

        <p>This OTP is valid for <strong>5 minutes</strong>. If you didn’t request this, you can safely ignore this email.</p>

        <p>Stay safe,</p>
        <p><strong>The Ancestropedia Team</strong></p>

        <hr style="margin-top: 30px;" />
        <p style="font-size: 12px; color: #999; text-align: center;">
          Need help? <a href="mailto:dave@ancestropedia.com" style="color: #007BFF;">Contact us</a>
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

export const sendVerificationMail = async (user) => {
  const otp = generateOtp();

  const mailOptions = {
    from: `"Ancestropedia Team" <${process.env.EMAIL}>`,
    to: user.email,
    subject: "Verify Your Ancestropedia Email Address",
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img 
            src="https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=294,fit=crop,q=95/mjE7lpywOyIq5zKx/ancestropedia-1-mePx4pQ230uGow26.png" 
            alt="Ancestropedia Logo" 
            style="width: 100px; height: 100px; object-fit: cover; border-radius: 50%;" 
          />
        </div>

        <h2 style="text-align: center; color: #007BFF;">Email Verification Required</h2>

        <p>Hello ${user.firstName || "User"},</p>

        <p>Thank you for signing up to <strong>Ancestropedia</strong>.</p>

        <p>Please use the following One-Time Password (OTP) to verify your email address:</p>

        <div style="text-align: center; margin: 30px 0;">
          <span style="
            font-size: 28px;
            letter-spacing: 6px;
            font-weight: bold;
            color: #222;
            background-color: #f0f0f0;
            padding: 12px 24px;
            border-radius: 8px;
            display: inline-block;
          ">
            ${otp}
          </span>
        </div>

        <p>This OTP will expire in <strong>5 minutes</strong>. Enter it on the Ancestropedia verification screen to activate your account.</p>

        <p>If you didn’t create an account, please ignore this email.</p>

        <p>Kind regards,</p>
        <p><strong>The Ancestropedia Team</strong></p>

        <hr style="margin-top: 30px;" />
        <p style="font-size: 12px; color: #999; text-align: center;">
          Need help? <a href="mailto:dave@ancestropedia.com" style="color: #007BFF;">Contact us</a>
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  return otp;
};

export const sendReportReviewMail = async (report, user) => {
  const mailOptions = {
    from: `"Ancestropedia Team" <${process.env.EMAIL}>`,
    to: user.email,
    subject: "Ancestropedia Report Review Update",
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img 
            src="https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=294,fit=crop,q=95/mjE7lpywOyIq5zKx/ancestropedia-1-mePx4pQ230uGow26.png" 
            alt="Ancestropedia Logo" 
            style="width: 100px; height: 100px; object-fit: cover; border-radius: 50%;" 
          />
        </div>
        <h2 style="text-align: center; color: #007BFF;">Report Status Update</h2>
        <p>Hello ${user.firstName || "User"},</p>
        <p>Your submitted report has been reviewed. Here are the details:</p>
        <div style="margin: 24px 0; background: #f4f8fc; padding: 18px; border-radius: 8px;">
          <p><strong>Report ID:</strong> ${report._id}</p>
          <p><strong>Description:</strong> ${report.description}</p>
          <p><strong>Status:</strong> <span style="color: #007BFF; font-weight: bold;">${
            report.status
          }</span></p>
        </div>
        <p>If you have questions or need further assistance, feel free to reply to this email.</p>
        <p>Kind regards,</p>
        <p><strong>The Ancestropedia Team</strong></p>
        <hr style="margin-top: 30px;" />
        <p style="font-size: 12px; color: #999; text-align: center;">
          Need help? <a href="mailto:dave@ancestropedia.com" style="color: #007BFF;">Contact us</a>
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

export const sendTokenAllotmentMail = async (user, redirectUrl) => {
  const mailOptions = {
    from: `"Ancestropedia Team" <${process.env.EMAIL}>`,
    to: user.email,
    subject: "You Have Been Allotted Tree Access Token",
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img 
            src="https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=294,fit=crop,q=95/mjE7lpywOyIq5zKx/ancestropedia-1-mePx4pQ230uGow26.png" 
            alt="Ancestropedia Logo" 
            style="width: 100px; height: 100px; object-fit: cover; border-radius: 50%;" 
          />
        </div>
        <h2 style="text-align: center; color: #28a745;">Token Allotted</h2>
        <p>Hello ${user.firstName || "User"},</p>
        <p>You have been successfully allotted  token to access and contribute to a family tree.</p>
        <p>To view and start editing, please click the link below:</p>
        <div style="margin: 20px 0;">
          <a href="${redirectUrl}" style="background-color: #28a745; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Access Tree</a>
        </div>
        <p>Regards,</p>
        <p><strong>The Ancestropedia Team</strong></p>
        <hr style="margin-top: 30px;" />
        <p style="font-size: 12px; color: #999; text-align: center;">
          Need help? <a href="mailto:dave@ancestropedia.com" style="color: #007BFF;">Contact us</a>
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};
export const sendWelcomeMail = async (user) => {
  const mailOptions = {
    from: `"Ancestropedia Team" <${process.env.EMAIL}>`,
    to: user.email,
    subject: "Welcome to Ancestropedia 🎉",
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #f9f9f9;">
        
        <div style="text-align: center; margin-bottom: 25px;">
          <img 
            src="https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=294,fit=crop,q=95/mjE7lpywOyIq5zKx/ancestropedia-1-mePx4pQ230uGow26.png" 
            alt="Ancestropedia Logo" 
            style="width: 90px; height: 90px; object-fit: cover; border-radius: 50%;" 
          />
        </div>

        <h2 style="text-align: center; color: #2f855a;">Welcome to Ancestropedia, ${user.firstName || "Explorer"}!</h2>
        
        <p style="font-size: 16px; line-height: 1.6;">
          We're thrilled to have you join our growing community of family history enthusiasts. Ancestropedia helps you connect, preserve, and contribute to your family's story — one branch at a time.
        </p>

        <p style="font-size: 16px; line-height: 1.6;">
          Whether you're exploring your ancestry or collaborating with relatives on a shared tree, we’re here to support your journey.
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="https://www.ancestropedia.com/dashboard" style="background-color: #2f855a; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-size: 16px;">
            Go to Your Dashboard
          </a>
        </div>

        <p style="font-size: 16px; line-height: 1.6;">
          If you ever need help or have questions, don’t hesitate to reach out. Our team is always here to assist you.
        </p>

        <p style="margin-top: 30px;">Warm regards,</p>
        <p><strong>The Ancestropedia Team</strong></p>

        <hr style="margin-top: 40px; border-color: #ddd;" />

        <p style="font-size: 12px; color: #888; text-align: center;">
          Need assistance? <a href="mailto:dave@ancestropedia.com" style="color: #007BFF;">Contact Support</a>
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

export const sendTokenRemovalMail = async (user, redirectUrl) => {
  const mailOptions = {
    from: `"Ancestropedia Team" <${process.env.EMAIL}>`,
    to: user.email,
    subject: "Tree Access Token Removed",
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img 
            src="https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=294,fit=crop,q=95/mjE7lpywOyIq5zKx/ancestropedia-1-mePx4pQ230uGow26.png" 
            alt="Ancestropedia Logo" 
            style="width: 100px; height: 100px; object-fit: cover; border-radius: 50%;" 
          />
        </div>
        <h2 style="text-align: center; color: #dc3545;">Token Access Removed</h2>
        <p>Hello ${user.firstName || "User"},</p>
        <p>We wanted to let you know that your access to the tree has been revoked.</p>
        <p>If this was unexpected or you believe it’s a mistake, you can contact us.</p>
        <p>To check, please click the link below:</p>
        <div style="margin: 20px 0;">
          <a href="${redirectUrl}" style="background-color: #28a745; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Access Tree</a>
        </div>
        <p>Regards,</p>
        <p><strong>The Ancestropedia Team</strong></p>
        <hr style="margin-top: 30px;" />
        <p style="font-size: 12px; color: #999; text-align: center;">
          Need help? <a href="mailto:dave@ancestropedia.com" style="color: #007BFF;">Contact us</a>
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

export const sendTokenRejectionMail = async (user, redirectUrl) => {
  const mailOptions = {
    from: `"Ancestropedia Team" <${process.env.EMAIL}>`,
    to: user.email,
    subject: "Tree Access Request Rejected",
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img 
            src="https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=294,fit=crop,q=95/mjE7lpywOyIq5zKx/ancestropedia-1-mePx4pQ230uGow26.png" 
            alt="Ancestropedia Logo" 
            style="width: 100px; height: 100px; object-fit: cover; border-radius: 50%;" 
          />
        </div>
        <h2 style="text-align: center; color: #dc3545;">Access Request Rejected</h2>
        <p>Hello ${user.firstName || "User"},</p>
        <p>Unfortunately, your request to get the tokens has been rejected by the owner or admin.</p>
        <p>You can reply to this email if you want to appeal or know more about the reason.</p>
        <p>To view and check, please click the link below:</p>
        <div style="margin: 20px 0;">
          <a href="${redirectUrl}" style="background-color: #28a745; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Access Tree</a>
        </div>
        <p>Regards,</p>
        <p><strong>The Ancestropedia Team</strong></p>
        <hr style="margin-top: 30px;" />
        <p style="font-size: 12px; color: #999; text-align: center;">
          Need help? <a href="mailto:dave@ancestropedia.com" style="color: #007BFF;">Contact us</a>
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

export const getAllEvents = (persons) => {
  const today = new Date();
  const day = today.getUTCDate();
  const month = today.getUTCMonth() + 1;

  return persons.reduce((events, person) => {
    // Check birthdays
    if (person.dob) {
      const dob = new Date(person.dob);
      if (dob.getUTCDate() === day && dob.getUTCMonth() + 1 === month) {
        events.push({
          type: "birthday",
          person: {
            _id: person._id,
            firstName: person.firstName,
            lastName: person.lastName,
            profileImage: person.profileImage,
          },
        });
      }
    }

    // Check death anniversaries
    if (!person.living && person.dod) {
      const dod = new Date(person.dod);
      if (dod.getUTCDate() === day && dod.getUTCMonth() + 1 === month) {
        events.push({
          type: "death",
          person: {
            _id: person._id,
            firstName: person.firstName,
            lastName: person.lastName,
            profileImage: person.profileImage,
          },
        });
      }
    }

    return events;
  }, []);
};
