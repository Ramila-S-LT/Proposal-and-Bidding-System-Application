const cds = require("@sap/cds");
const ax = require('axios');
require('dotenv').config()
const https = require('https');

module.exports = cds.service.impl(async function () {
    console.log("equipment_allocation.js loaded");

    const { SELECT, INSERT, UPDATE } = cds.ql;
    
    const conn = await cds.connect.to('ANS-Producer');
    console.log("Conn : ", conn);

    const {
        Proposals,
        ProposalItems,
        RentalContracts,
        RentalAllocations,
        Rental_Physical_Equipment,
        Customers
    } = this.entities;

    // -----------------------------------------------------
    // HELPER
    // -----------------------------------------------------

    const normalizeStatus = (value) =>
        String(value || "").trim().toUpperCase();

    // =====================================================
    // GET APPROVED PROPOSALS
    // =====================================================

    this.on("getApprovedProposals", async () => {
        return SELECT
            .from(Proposals)
            .where({ proposalStatus: "Approved" });
    });

    // Keep direct Proposal reads restricted to approved proposals.
    this.before("READ", Proposals, (req) => {
        req.query.where({ proposalStatus: "Approved" });
    });

    // =====================================================
    // GET PROPOSAL ITEMS
    // =====================================================

    this.on("getProposalItems", async (req) => {
        const { proposal_ID } = req.data;

        if (!proposal_ID) {
            return req.error(400, "Proposal ID is required.");
        }

        const proposal = await SELECT.one.from(Proposals).where({ ID: proposal_ID });

        if (!proposal) {
            return req.error(404, "Approved proposal not found.");
        }

        // if (normalizeStatus(proposal.proposalStatus) !== "APPROVED") {
        //     return req.error(
        //         400,
        //         "Items can be retrieved only for approved proposals."
        //     );
        // }

        return SELECT.from(ProposalItems).where({ proposals_ID: proposal_ID });
    });
    // GET AVAILABLE EQUIPMENT
    // Only equipment matching the selected proposal's
    // requested products and having AVAILABLE status.


    this.on("getAvailableEquipment", async (req) => {
        const { proposal_ID } = req.data;

        if (!proposal_ID) {
            return req.error(400, "Proposal ID is required.");
        }

        const proposal = await SELECT.one
            .from(Proposals)
            .where({ ID: proposal_ID });

        if (!proposal) {
            return req.error(404, "Approved proposal not found.");
        }

        // if (normalizeStatus(proposal.proposalStatus) !== "APPROVED") {
        //     return req.error(
        //         400,
        //         "Equipment can be selected only for approved proposals."
        //     );
        // }

        // Get the products requested by this proposal.
        const items = await SELECT
            .from(ProposalItems)
            .columns("product_ID")
            .where({ proposals_ID: proposal_ID });

        const productIds = [
            ...new Set(
                items
                    .map((item) => item.product_ID)
                    .filter(Boolean)
            )
        ];

        if (productIds.length === 0) {
            return [];
        }

        // Return only available physical equipment matching
        // the proposal's requested products.
        return SELECT
            .from(Rental_Physical_Equipment)
            .where({
                product_ref_ID: { in: productIds },
                status: "AVAILABLE"
            })
            .orderBy("equipment_Code");
    });

    // =====================================================
    // GET EQUIPMENT HISTORY
    // =====================================================

    this.on("getEquipmentHistory", async (req) => {
        const { equipment_ID } = req.data;

        if (!equipment_ID) {
            return req.error(400, "Equipment ID is required.");
        }

        const equipment = await SELECT.one
            .from(Rental_Physical_Equipment)
            .where({ ID: equipment_ID });

        if (!equipment) {
            return req.error(404, "Equipment not found.");
        }

        return SELECT
            .from(RentalAllocations)
            .where({ equipment_ID });
    });

    // =====================================================
    // CREATE RENTAL CONTRACT
    //
    // IMPORTANT:
    // This handler is intentionally removed from this file.
    // The single createRentalContract handler in
    // rental_management.js derives customer_ID from the
    // selected proposal and saves the contract.
    // =====================================================

    // =====================================================
    // ALLOCATE EQUIPMENT
    // =====================================================

    async function generateToken(){
        console.log("Token Function");
        console.log("Client ID : ", process.env.client_id);
        console.log("Clinet Secret : ", process.env.client_secret);
        
        const tokenResponse = await conn.send({
            method: "POST",
            path: '/oauth/token',
            headers : {
                "Content-Type" : "application/x-www-form-urlencoded"
            },
            data: "grant_type=client_credentials"
        });

        const token = tokenResponse.access_token;
        console.log("Token  : ", token);
        
        return token;
    };

    async function notifyCustomerVerification(customer, token, pdf) {
            console.log("Token : ", token);
            console.log("Customer : ", customer);
            console.log("Customer Email : ", customer.customerEmail);
            console.log("PDF : ", pdf);
            
            
        
            console.log("Customer Verification notification");
            // console.log("Customer ID : ", customer.ID);
            // console.log("Customer Email : ", customer.customerEmail);
    
            await ax.post(
                'https://clm-sl-ans-live-ans-service-api.cfapps.us10.hana.ondemand.com/cf/producer/v1/resource-events',
                {
                    eventType : "Rental_Contract_Allocate",
                    severity : "INFO",
                    subject: "Customer Verification Successful",
                    body: `Dear,\n\nGreetings from GMMCO!\n\nWe are pleased to inform you that your company registration has been successfully verified and approved.\n\nRegistered Email: \nVerification Status: Approved\n\nThank you for choosing GMMCO.\n\nBest regards,\nGMMCO Team`,
                    category : "NOTIFICATION",
                    tags : {
                        customerEmail : customer.customerEmail
                    },
                    pdf : pdf,
                    resource : {
                        resourceName : "GMMCOApplication",
                        resourceType : "Application",
                        resourceInstance : "1",
                        tags : {
                            appliation : "Proposal-Creation"
                        }
                    }
                },
    
                {
                    headers : {
                        Authorization : `Bearer ${token}`,
                        "Content-Type" : "application/json"
                    },
                    httpsAgent : new https.Agent({
                        rejectUnauthorized: false
                    }),
                    proxy : false
                }
            );
    
            console.log("Customer Verification event sent successfully");
            
        }

        async function generatePDF(id) {
            // const { rentalContract_ID } = req.data;

            if (!id) {
                return req.error(400, "Rental contract ID is required.");
            }

            try {
                const { buffer } = await buildRentalPdf(id);
                console.log("Buffer : ", buffer);
                
                return buffer.toString("base64");
                
            } catch (error) {
                console.error("PDF generation failed:", error.message);
                return req.error(502, "Rental contract PDF generation failed.");
            
            }
        };

        async function buildRentalPdf(contractId) {
            console.log("Testing");
            
            if (!contractId) {
                throw new Error("Rental contract ID is required.");
            }

            const contract = await SELECT.one
                .from(RentalContracts)
                .where({ ID: contractId });

                console.log("Contract : ", contract);
                

            if (!contract) {
                throw new Error("Rental contract not found.");
            }

            if (!contract.customer_ID) {
                throw new Error(
                    "The rental contract does not have a customer assigned."
                );
            }

            if (!Customers) {
                throw new Error(
                    "Customer entity Master.db.Customers could not be found."
                );
            }

            const customer = await SELECT.one
                .from(Customers)
                .where({ ID: contract.customer_ID });

                console.log("Customer : ", customer);
                

            if (!customer) {
                throw new Error(
                    "Customer assigned to the contract was not found."
                );
            }

            const allocations = await SELECT
                .from(RentalAllocations)
                .where({ rentalContract_ID: contractId });

                console.log("Allocations : ", allocations);
                

            const equipmentIds = allocations
                .map((allocation) => allocation.equipment_ID)
                .filter(Boolean);

                console.log("Equipment Id : ", equipmentIds);
                

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
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            padding: 30px;
                            color: #222;
                        }
                        table {
                            border-collapse: collapse;
                            width: 100%;
                            margin-top: 12px;
                        }
                        th, td {
                            border: 1px solid #888;
                            padding: 8px;
                            text-align: left;
                        }
                        th {
                            background: #f2f2f2;
                        }
                    </style>
                </head>
                <body>
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

                    <table>
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

            const pdfUrl = process.env.PDFSHIFT_URL;
            const pdfApiKey = process.env.PDFSHIFT_API_KEY;

            if (!pdfUrl || !pdfApiKey) {
                throw new Error(
                    "PDFShift configuration is missing. Check PDFSHIFT_URL and PDFSHIFT_API_KEY."
                );
            }

            const pdfResponse = await fetch(
                `${pdfUrl.replace(/\/+$/, "")}/convert/pdf`,
                {
                    method: "POST",
                    headers: {
                        "X-API-Key": pdfApiKey,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        source: html,
                        sandbox: false
                    })
                }
            );

            if (!pdfResponse.ok) {
                const errorText = await pdfResponse.text();

                console.error(
                    "PDFShift request failed:",
                    pdfResponse.status,
                    errorText.slice(0, 1000)
                );

                throw new Error(
                    `PDFShift PDF generation failed with status ${pdfResponse.status}.`
                );
            }

            const buffer = Buffer.from(
                await pdfResponse.arrayBuffer()
            );

            if (
                buffer.length < 5 ||
                buffer.subarray(0, 5).toString() !== "%PDF-"
            ) {
                throw new Error(
                    "PDFShift did not return a valid PDF file."
                );
            }

            return { contract, customer, buffer };
    }

    function esc(value) {
        if (value === null || value === undefined) {
            return "";
        }

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    };



    this.on("allocationEquipment", async (req) => {
        const {
            proposal_ID,
            equipment_ID,
            startDate,
            endDate,
            rentalContract_ID
        } = req.data;

        // 1. Validate required fields.
        if (!proposal_ID) {
            return req.error(400, "Proposal ID is required.");
        }

        if (!equipment_ID) {
            return req.error(400, "Equipment ID is required.");
        }

        if (!rentalContract_ID) {
            return req.error(400, "Rental Contract ID is required.");
        }

        if (!startDate || !endDate) {
            return req.error(
                400,
                "Rental start date and end date are required."
            );
        }

        // 2. Validate dates.
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (
            Number.isNaN(start.getTime()) ||
            Number.isNaN(end.getTime())
        ) {
            return req.error(400, "Invalid rental dates.");
        }

        if (start > end) {
            return req.error(
                400,
                "Rental start date cannot be after the end date."
            );
        }

        // 3. Check the selected proposal.
        const proposal = await SELECT.one
            .from(Proposals)
            .where({ ID: proposal_ID });
            console.log("Proposal Data : ", proposal);

        const customer = await SELECT.one.from('Customers').where({ID : proposal.customer_ID});
        console.log("Customer ID : ", customer);
        
        
        if (!proposal) {
            return req.error(404, "Proposal not found.");
        }

        // if (normalizeStatus(proposal.proposalStatus) !== "APPROVED") {
        //     return req.error(
        //         400,
        //         "Equipment can be allocated only to an approved proposal."
        //     );
        // }

        // 4. Check the rental contract.
        const contract = await SELECT.one
            .from(RentalContracts)
            .where({ ID: rentalContract_ID });

        if (!contract) {
            return req.error(404, "Rental contract not found.");
        }

        // if (normalizeStatus(contract.contractStatus) !== "ACTIVE") {
        //     return req.error(
        //         400,
        //         "Equipment can be allocated only to an active rental contract."
        //     );
        // }

        // 5. Ensure the contract belongs to the selected proposal.
        if (String(contract.proposal_ID) !== String(proposal_ID)) {
            return req.error(
                400,
                "The rental contract does not belong to the selected proposal."
            );
        }

        // 6. Ensure the allocation dates fall within the contract period.
        const contractStart = new Date(contract.startDate);
        const contractEnd = new Date(contract.endDate);

        if (
            start < contractStart ||
            end > contractEnd
        ) {
            return req.error(
                400,
                "Equipment allocation dates must fall within the rental contract period."
            );
        }

        // 7. Check the selected physical equipment.
        const equipment = await SELECT.one
            .from(Rental_Physical_Equipment)
            .where({ ID: equipment_ID });

        if (!equipment) {
            return req.error(404, "Selected equipment not found.");
        }

        // if (normalizeStatus(equipment.status) !== "AVAILABLE") {
        //     return req.error(
        //         400,
        //         "Selected equipment is no longer available."
        //     );
        // }

        // 8. Verify that the equipment product was requested
        //    in this proposal.
        // const matchingItem = await SELECT.one
        //     .from(ProposalItems)
        //     .columns("ID")
        //     .where({
        //         proposals_ID: proposal_ID,
        //         product_ID: equipment.product_ref_ID
        //     });

        // if (!matchingItem) {
        //     return req.error(
        //         400,
        //         "Selected equipment does not match any product requested in this proposal."
        //     );
        // }

        // 9. Create the allocation.
        const allocationId = cds.utils.uuid();
        const allocationNumber =
            `ALLOC-${Date.now()}-${allocationId.slice(0, 8)}`;

        try {
            await INSERT.into(RentalAllocations).entries({
                ID: allocationId,
                allocationNumber,
                allocationDate: new Date(),
                allocationStartDate: startDate,
                allocationEndDate: endDate,
                allocationStatus: "Allocated",
                rentalContract_ID,
                equipment_ID
            });

            // 10. Mark the equipment as allocated.
            await UPDATE(Rental_Physical_Equipment)
                .set({ status: "AT_CUSTOMER" })
                .where({
                    ID: equipment_ID,
                    status: "AVAILABLE"
                });

            // 11. Confirm that the equipment is no longer available.
            const updatedEquipment = await SELECT.one
                .from(Rental_Physical_Equipment)
                .where({ ID: equipment_ID });

            // if (
            //     !updatedEquipment ||
            //     normalizeStatus(updatedEquipment.status) !== "AT_CUSTOMER"
            // ) {
            //     throw new Error(
            //         "Equipment status could not be updated. Please check the allocation."
            //     );
            // }

            const token = await generateToken();
            console.log("Token");

            const pdf = await generatePDF(rentalContract_ID);
            console.log("PDF : ", pdf);

            const result = await notifyCustomerVerification(customer, token, pdf)

            return "Equipment allocated successfully.";
        } catch (error) {
            console.error(
                "Equipment allocation failed:",
                error.message
            );

            throw error;
        }
    });
});
