require("dotenv").config();

const {sendCustomerVerificationEmail} = require("./customer-email");

async function testEmail(){
    try {
        const customer = {
            name : "Ramila",
            email : "keerthanab1510@gmail.com"
        };

        await sendCustomerVerificationEmail(customer);
    } catch(error) {
        console.error("Email Sending Failed");
        console.error(error);
    }
}

testEmail();
