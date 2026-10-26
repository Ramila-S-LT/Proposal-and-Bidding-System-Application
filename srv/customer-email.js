const nodemailer = require("nodemailer");

async function sendCustomerVerificationEmail(customer) {
    if(!customer || !customer.email) {
        throw new Error("customer email is missing");
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port : Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        auth : {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });

    await transporter.sendMail({
        from: process.env.MAIL_FROM,
        to: customer.email,
        subject: "GMMCO Account Verification Successful",
        text: "Hello customer",

        
    });
    console.log("Verification email sent to customer")
}

module.exports = {sendCustomerVerificationEmail};
