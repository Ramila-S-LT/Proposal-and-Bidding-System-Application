/* const cds = require("@sap/cds");
const nodemailer = require("nodemailer");

module.exports = cds.service.impl(async function () {

    // =========================================================
    // SEND RENTAL CONFIRMATION EMAIL
    // =========================================================

    this.on("sendRentalConfirmation", async (req) => {

        const { rentalContract_ID } = req.data;

        // Check Rental Contract ID
        if (!rentalContract_ID) {
            return req.error(
                400,
                "Rental Contract ID is required."
            );
        }

        // -----------------------------------------------------
        // Get Rental Contract
        // -----------------------------------------------------

        const contract = await SELECT.one
            .from("proposal.srv.RentalContracts")
            .where({
                ID: rentalContract_ID
            });

        if (!contract) {
            return req.error(
                404,
                "Rental contract not found."
            );
        }

        // -----------------------------------------------------
        // Get Customer
        // -----------------------------------------------------

        const customer = await SELECT.one
            .from("proposal.srv.Customers")
            .where({
                ID: contract.customer_ID
            });

        if (!customer) {
            return req.error(
                404,
                "Customer not found."
            );
        }

        // -----------------------------------------------------
        // Check Customer Email
        // -----------------------------------------------------

        if (!customer.email) {
            return req.error(
                400,
                "Customer email address is not available."
            );
        }

        // -----------------------------------------------------
        // Create Email Transporter
        // -----------------------------------------------------

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),

            secure:
                process.env.SMTP_SECURE === "true",

            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        });

        // -----------------------------------------------------
        // Email Content
        // -----------------------------------------------------

        const subject =
            "Rental Contract Confirmation - " +
            contract.contractNumber;

        const message = `
Dear Customer,

Your rental contract has been created successfully.

Rental Contract Number:
${contract.contractNumber}

Contract Date:
${contract.contractDate}

Start Date:
${contract.startDate}

End Date:
${contract.endDate}

Total Rental Amount:
${contract.totalRentalAmount}

The equipment allocation has also been completed successfully.

Thank you.

Regards,
Rental Management Team
`;

        // -----------------------------------------------------
        // Send Email
        // -----------------------------------------------------

        try {

            await transporter.sendMail({

                from: process.env.SMTP_FROM,

                to: customer.email,

                subject: subject,

                text: message
            });

            console.log(
                "Rental confirmation email sent to:",
                customer.email
            );

            return "Customer email sent successfully.";

        } catch (error) {

            console.error(
                "Email sending failed:",
                error.message
            );

            return req.error(
                500,
                "Rental contract was created, but customer email could not be sent."
            );
        }
    });

}); */