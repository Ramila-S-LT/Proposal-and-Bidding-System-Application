const cds = require("@sap/cds");
const nodemailer = require("nodemailer");

// =========================================================
// HELPER FUNCTIONS
// =========================================================

const esc = (value) =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

function normalizeStatus(value) {
    return String(value || "").trim().toUpperCase();
}

// =========================================================
// EMAIL HELPER (SMTP) - sends the confirmation to the customer
// =========================================================

let _transporter;
function getTransporter() {
    if (!_transporter) {
        _transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: String(process.env.SMTP_SECURE) === "true",
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
    }
    return _transporter;
}

// =========================================================
// SAP ALERT NOTIFICATION SERVICE (internal alerts only)
// =========================================================

async function sendAlert(subject, body, severity = "INFO", tags = {}) {
    try {
        let credentials = {};

        if (process.env.VCAP_SERVICES) {
            const vcap = JSON.parse(process.env.VCAP_SERVICES);

            for (const services of Object.values(vcap)) {
                const ansService = services.find(
                    (service) =>
                        service.name === "gmmco-alert-instance" ||
                        service.label === "alert-notification"
                );

                if (ansService) {
                    credentials = ansService.credentials || {};
                    break;
                }
            }
        }

        // Environment-variable fallback for local development.
        const clientId = credentials.client_id || process.env.ANS_CLIENT_ID;
        const clientSecret = credentials.client_secret || process.env.ANS_CLIENT_SECRET;
        const tokenUrl = credentials.oauth_url || process.env.ANS_TOKEN_URL;
        const apiUrl = credentials.url || process.env.ANS_API_URL;

        if (!clientId || !clientSecret || !tokenUrl || !apiUrl) {
            console.error("ANS configuration is incomplete. Check the service binding.");
            return false;
        }

        const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

        const tokenResponse = await fetch(tokenUrl, {
            method: "POST",
            headers: {
                Authorization: `Basic ${basic}`,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: "grant_type=client_credentials"
        });

        if (!tokenResponse.ok) {
            console.error(
                "ANS token request failed:",
                tokenResponse.status,
                (await tokenResponse.text()).slice(0, 500)
            );
            return false;
        }

        const tokenData = await tokenResponse.json();

        if (!tokenData.access_token) {
            console.error("ANS did not return an access token.");
            return false;
        }

        // ANS tag values must be strings
        const safeTags = {};
        for (const [key, value] of Object.entries(tags || {})) {
            safeTags[key] = String(value ?? "");
        }

        const eventUrl = `${apiUrl.replace(/\/+$/, "")}/cf/producer/v1/resource-events`;

        const eventResponse = await fetch(eventUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                eventType: "RentalMail", // keep the same one your ANS subscription uses
                resource: {
                    resourceName: "rental-service",
                    resourceType: "service"
                },
                severity,
                category: "NOTIFICATION",
                subject,
                body,
                tags: safeTags
            })
        });

        if (!eventResponse.ok) {
            console.error(
                "ANS event request failed:",
                eventResponse.status,
                (await eventResponse.text()).slice(0, 500)
            );
            return false;
        }

        console.log("ANS event accepted:", subject);
        return true;
    } catch (error) {
        console.error("ANS notification failed:", error.message);
        return false;
    }
}

// =========================================================
// CAP SERVICE HANDLERS
// =========================================================

module.exports = cds.service.impl(function () {
    const { SELECT, INSERT, UPDATE } = cds.ql;

    const {
        Proposals,
        RentalContracts,
        RentalAllocations,
        Rental_Physical_Equipment
    } = this.entities;

    const masterEntities = cds.entities("Master.db") || {};
    const Customers = masterEntities.Customers;

    // =====================================================
    // BUILD RENTAL CONTRACT PDF (PDFShift, no email here)
    // =====================================================

    async function buildRentalPdf(contractId) {
        if (!contractId) {
            throw new Error("Rental contract ID is required.");
        }

        const contract = await SELECT.one
            .from(RentalContracts)
            .where({ ID: contractId });

        if (!contract) {
            throw new Error("Rental contract not found.");
        }

        if (!Customers) {
            throw new Error(
                "Customer entity Master.db.Customers could not be found."
            );
        }

        const customer = await SELECT.one
            .from(Customers)
            .where({ ID: contract.customer_ID });

        if (!customer) {
            throw new Error("Customer assigned to the contract was not found.");
        }

        const allocations = await SELECT
            .from(RentalAllocations)
            .where({ rentalContract_ID: contractId });

        const equipmentIds = allocations
            .map((allocation) => allocation.equipment_ID)
            .filter(Boolean);

        const equipment = equipmentIds.length
            ? await SELECT.from(Rental_Physical_Equipment).where({
                  ID: { in: equipmentIds }
              })
            : [];

        const equipmentRows = equipment
            .map(
                (item) => `
                    <tr>
                        <td>${esc(item.equipment_Code)}</td>
                        <td>${esc(item.equipment_Name)}</td>
                        <td>${esc(item.serial_Number)}</td>
                        <td>${esc(item.status)}</td>
                    </tr>
                `
            )
            .join("");

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Rental Contract</title>
            </head>
            <body style="font-family:Arial,sans-serif;padding:30px;color:#222">
                <h2>Rental Contract Confirmation</h2>

                <p><strong>Contract Number:</strong>
                    ${esc(contract.contractNumber)}</p>

                <p><strong>Customer:</strong>
                    ${esc(customer.companyName)}</p>

                <p><strong>Customer Code:</strong>
                    ${esc(customer.customerCode)}</p>

                <p><strong>Contact Person:</strong>
                    ${esc(customer.contactPerson)}</p>

                <p><strong>Contract Date:</strong>
                    ${esc(contract.contractDate)}</p>

                <p><strong>Rental Period:</strong>
                    ${esc(contract.startDate)} to ${esc(contract.endDate)}</p>

                <p><strong>Total Rental Amount:</strong>
                    ${esc(contract.totalRentalAmount)}</p>

                <h3>Allocated Equipment</h3>

                <table border="1" cellpadding="8"
                    style="border-collapse:collapse;width:100%">
                    <thead>
                        <tr>
                            <th>Equipment Code</th>
                            <th>Equipment Name</th>
                            <th>Serial Number</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${
                            equipmentRows ||
                            '<tr><td colspan="4">No equipment allocated</td></tr>'
                        }
                    </tbody>
                </table>
            </body>
            </html>
        `;

        const pdfConfig = cds.env.requires?.PDFSHIFT?.credentials;

        if (!pdfConfig?.url || !pdfConfig?.apiKey) {
            throw new Error(
                "PDFShift configuration is missing. Check your application configuration."
            );
        }

        const pdfResponse = await fetch(
            `${pdfConfig.url.replace(/\/+$/, "")}/convert/pdf`,
            {
                method: "POST",
                headers: {
                    "X-API-Key": pdfConfig.apiKey,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    source: html,
                    sandbox: true
                })
            }
        );

        if (!pdfResponse.ok) {
            throw new Error(`PDFShift failed: ${await pdfResponse.text()}`);
        }

        const buffer = Buffer.from(await pdfResponse.arrayBuffer());

        return { contract, customer, buffer };
    }

    // =====================================================
    // GENERATE RENTAL PDF
    // =====================================================

    this.on("generateRentalPdf", async (req) => {
        const { rentalContract_ID } = req.data;

        if (!rentalContract_ID) {
            return req.error(400, "Rental contract ID is required.");
        }

        try {
            const { buffer } = await buildRentalPdf(rentalContract_ID);
            return buffer.toString("base64");
        } catch (error) {
            console.error("PDF generation failed:", error.message);
            return req.error(502, error.message);
        }
    });

    // =====================================================
    // SEND RENTAL CONFIRMATION
    // Emails the customer with the generated PDF attached,
    // then sends an internal ANS alert (optional).
    // =====================================================

    this.on("sendRentalConfirmation", async (req) => {
        const { rentalContract_ID } = req.data;
        console.log("sendRentalConfirmation called:", rentalContract_ID);

        if (!rentalContract_ID) {
            return { success: false, message: "Rental contract ID is required." };
        }

        try {
            const { contract, customer, buffer } =
                await buildRentalPdf(rentalContract_ID);

            const customerEmail = (customer?.customerEmail || "").trim();
            const customerName = customer?.companyName || "Customer";

            if (!customerEmail) {
                return {
                    success: false,
                    message: "Customer email is not available for this contract."
                };
            }

            // 1. Email the customer with the PDF attached
            await getTransporter().sendMail({
                from: process.env.MAIL_FROM || process.env.SMTP_USER,
                to: customerEmail,
                subject: `Rental confirmation - ${contract.contractNumber}`,
                text: [
                    `Dear ${customerName},`,
                    "",
                    `Your rental contract ${contract.contractNumber} has been confirmed.`,
                    "Please find the rental confirmation attached.",
                    "",
                    "Thank you."
                ].join("\n"),
                attachments: [
                    {
                        filename: `Rental-${contract.contractNumber}.pdf`,
                        content: buffer,
                        contentType: "application/pdf"
                    }
                ]
            });
            console.log("Customer email sent to:", customerEmail);

            // 2. Internal ANS alert. Never affects the result.
            try {
                await sendAlert(
                    `Rental confirmation sent - ${contract.contractNumber}`,
                    `Confirmation emailed to ${customerName} (${customerEmail})`,
                    "INFO",
                    {
                        customerEmail,
                        contractNumber: String(contract.contractNumber)
                    }
                );
            } catch (e) {
                console.warn("ANS alert skipped:", e.message);
            }

            return {
                success: true,
                message: `Rental confirmation notification sent to ${customerEmail}.`
            };
        } catch (error) {
            console.error("Rental confirmation failed:", error);
            return {
                success: false,
                // Temporary while testing. Change to a generic message later.
                message:
    "Could not send confirmation: " +
    (error.message || error.code || (error.errors && error.errors[0]?.message) || "Unknown error")
            };
        }
    });

    // =====================================================
    // CREATE RENTAL CONTRACT
    // Customer ID is derived from the selected proposal.
    // =====================================================

    this.on("createRentalContract", async (req) => {
        const {
            proposal_ID,
            contractNumber,
            contractDate,
            startDate,
            endDate,
            totalRentalAmount
        } = req.data;

        if (!proposal_ID) {
            return req.error(400, "Proposal ID is required.");
        }

        const proposal = await SELECT.one
            .from(Proposals)
            .columns("ID", "customer_ID", "proposalStatus")
            .where({ ID: proposal_ID });

        if (!proposal) {
            return req.error(404, "Proposal not found.");
        }

        if (normalizeStatus(proposal.proposalStatus) !== "APPROVED") {
            return req.error(
                400,
                "A rental contract can be created only for an approved proposal."
            );
        }

        const customerId = proposal.customer_ID;

        if (!customerId) {
            return req.error(
                400,
                "The selected proposal has no customer assigned."
            );
        }

        if (!Customers) {
            return req.error(
                500,
                "Customer entity Master.db.Customers could not be found."
            );
        }

        const customer = await SELECT.one
            .from(Customers)
            .columns("ID")
            .where({ ID: customerId });

        if (!customer) {
            return req.error(
                400,
                "The customer assigned to this proposal does not exist."
            );
        }

        if (!String(contractNumber || "").trim()) {
            return req.error(400, "Contract number is required.");
        }

        const normalizedContractNumber =
            String(contractNumber).trim().toUpperCase();

        const existingContract = await SELECT.one
            .from(RentalContracts)
            .columns("ID")
            .where({ contractNumber: normalizedContractNumber });

        if (existingContract) {
            return req.error(
                409,
                `Contract number ${normalizedContractNumber} already exists.`
            );
        }

        if (!contractDate) {
            return req.error(400, "Contract date is required.");
        }

        if (!startDate || !endDate) {
            return req.error(
                400,
                "Rental start date and end date are required."
            );
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return req.error(400, "Invalid rental dates.");
        }

        if (start > end) {
            return req.error(
                400,
                "Rental start date cannot be after the end date."
            );
        }

        if (
            totalRentalAmount === undefined ||
            totalRentalAmount === null ||
            String(totalRentalAmount).trim() === "" ||
            !Number.isFinite(Number(totalRentalAmount)) ||
            Number(totalRentalAmount) < 0
        ) {
            return req.error(400, "A valid total rental amount is required.");
        }

        const contractId = cds.utils.uuid();

        try {
            await INSERT.into(RentalContracts).entries({
                ID: contractId,
                proposal_ID: proposal.ID,
                customer_ID: customerId,
                contractNumber: normalizedContractNumber,
                contractDate,
                startDate,
                endDate,
                totalRentalAmount: Number(totalRentalAmount),
                contractStatus: "Active"
            });
        } catch (error) {
            if (/unique|constraint|duplicate/i.test(error.message || "")) {
                return req.error(
                    409,
                    `Contract number ${normalizedContractNumber} already exists.`
                );
            }

            throw error;
        }

        return contractId;
    });

    // =====================================================
    // GET ACTIVE RENTALS
    // =====================================================

    this.on("getActiveRentals", async () => {
        return SELECT.from(RentalContracts).where({
            contractStatus: "Active"
        });
    });

    // =====================================================
    // CHECK RENTAL PERIOD
    // =====================================================

    this.on("checkRentalPeriod", async (req) => {
        const { contract_ID, startDate, endDate } = req.data;

        if (!contract_ID) {
            return req.error(400, "Contract ID is required.");
        }

        if (!startDate || !endDate) {
            return req.error(
                400,
                "Rental start date and end date are required."
            );
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return req.error(400, "Invalid rental dates.");
        }

        if (start > end) {
            return req.error(400, "Start date cannot be after the end date.");
        }

        const contract = await SELECT.one
            .from(RentalContracts)
            .where({ ID: contract_ID });

        if (!contract) {
            return req.error(404, "Rental contract not found.");
        }

        if (normalizeStatus(contract.contractStatus) !== "ACTIVE") {
            return req.error(400, "Rental contract is not active.");
        }

        const activeContracts = await SELECT
            .from(RentalContracts)
            .where({ contractStatus: "Active" });

        for (const rental of activeContracts) {
            if (rental.ID === contract_ID) {
                continue;
            }

            if (!rental.startDate || !rental.endDate) {
                continue;
            }

            const existingStart = new Date(rental.startDate);
            const existingEnd = new Date(rental.endDate);

            if (start <= existingEnd && end >= existingStart) {
                return req.error(
                    400,
                    "The rental period overlaps with another active rental."
                );
            }
        }

        return "Rental period is available.";
    });

    // =====================================================
    // COMPLETE RENTAL CONTRACT
    // Releases allocated equipment and completes contract.
    // =====================================================

    this.on("completeRentalContract", async (req) => {
        const { contract_ID } = req.data;
        console.log("completeRentalContract called:", contract_ID);

        if (!contract_ID) {
            return req.reject(400, "Contract ID is required.");
        }

        const contract = await SELECT.one
            .from(RentalContracts)
            .where({ ID: contract_ID });

        if (!contract) {
            return req.reject(404, "Rental contract not found.");
        }

        if (normalizeStatus(contract.contractStatus) !== "ACTIVE") {
            return req.reject(400, "Rental contract is not active.");
        }

        const allocations = await SELECT
            .from(RentalAllocations)
            .where({ rentalContract_ID: contract_ID });

        if (!allocations || !allocations.length) {
            return req.reject(
                400,
                "No equipment is allocated to this rental contract."
            );
        }

        // 1. Release equipment
        for (const allocation of allocations) {
            if (!allocation.equipment_ID) {
                continue;
            }

            await UPDATE(Rental_Physical_Equipment)
                .set({ status: "AVAILABLE" })
                .where({ ID: allocation.equipment_ID });

            await UPDATE(RentalAllocations)
                .set({ allocationStatus: "Released" })
                .where({ ID: allocation.ID });
        }

        // 2. Complete the contract
        await UPDATE(RentalContracts)
            .set({ contractStatus: "Completed" })
            .where({ ID: contract_ID });

        // 3. Internal ANS alert (must never affect the result)
        try {
            const alertSent = await sendAlert(
                `Rental contract completed - ${contract.contractNumber}`,
                `Rental contract ${contract.contractNumber} has been completed and its allocated equipment has been released.`,
                "INFO",
                { contractNumber: String(contract.contractNumber) }
            );

            if (!alertSent) {
                console.warn(
                    "ANS alert was not accepted for completed contract:",
                    contract.contractNumber
                );
            }
        } catch (error) {
            console.error("ANS alert failed (contract already completed):", error);
        }

        return "Rental contract completed and equipment released successfully.";
    });

    // =====================================================
    // GET RENTAL HISTORY
    // =====================================================

    this.on("getRentalHistory", async () => {
        return SELECT.from(RentalContracts).where({
            contractStatus: {
                in: ["Completed", "Cancelled"]
            }
        });
    });
});