const cds = require("@sap/cds");
const axios = require("axios");
const https = require("https");
require("dotenv").config();

module.exports = cds.service.impl(async function () {
    console.log("equipment_allocation.js loaded");

    const { SELECT, INSERT, UPDATE } = cds.ql;

    const conn = await cds.connect.to("ANS-Producer");

    const {
        Proposals,
        ProposalItems,
        RentalContracts,
        RentalAllocations,
        Rental_Physical_Equipment,
        Customers
    } = this.entities;
    

    // --------------------------------------------------
    // HELPER: NORMALIZE EQUIPMENT STATUS
    // --------------------------------------------------

    function normalizeStatus(status) {
        return String(status || "").trim().toUpperCase();
    }

    // --------------------------------------------------
    // HELPER: GET PRODUCTS REQUESTED BY A PROPOSAL
    // ProposalItems.product_ID -> Product.ID
    // Rental_Physical_Equipment.product_ref_ID -> Product.ID
    // --------------------------------------------------

    async function getProposalProductIds(proposal_ID) {
        const items = await SELECT
            .from(ProposalItems)
            .columns("product_ID")
            .where({ proposals_ID: proposal_ID });

        return [
            ...new Set(
                items
                    .map((item) => item.product_ID)
                    .filter(Boolean)
                    .map(String)
            )
        ];
    }

    // --------------------------------------------------
    // GET APPROVED PROPOSALS
    // --------------------------------------------------

    this.on("getApprovedProposals", async () => {
        return SELECT
            .from(Proposals)
            .where({ proposalStatus: "Approved" });
    });

    // --------------------------------------------------
    // RESTRICT DIRECT PROPOSAL READS
    // --------------------------------------------------

    this.before("READ", Proposals, (req) => {
        req.query.where({ proposalStatus: "Approved" });
    });

    // --------------------------------------------------
    // GET PROPOSAL ITEMS
    // --------------------------------------------------

    this.on("getProposalItems", async (req) => {
        const { proposal_ID } = req.data;

        if (!proposal_ID) {
            return req.reject(400, "Proposal ID is required.");
        }

        const proposal = await SELECT.one
            .from(Proposals)
            .where({ ID: proposal_ID });

        if (!proposal) {
            return req.reject(404, "Approved proposal not found.");
        }

        if (
            String(proposal.proposalStatus || "").trim().toUpperCase()
            !== "APPROVED"
        ) {
            return req.reject(
                400,
                "Only approved proposals can be processed."
            );
        }

        return SELECT
            .from(ProposalItems)
            .where({ proposals_ID: proposal_ID });
    });

    // --------------------------------------------------
    // GET AVAILABLE EQUIPMENT
    //
    // Validation:
    // 1. Proposal must exist and be approved.
    // 2. Read product_ID from ProposalItems.
    // 3. Match product_ID with product_ref_ID.
    // 4. Return only AVAILABLE physical equipment.
    // 5. Trim status to handle values like "AVAILABLE ".
    // --------------------------------------------------

    this.on("getAvailableEquipment", async (req) => {
        const { proposal_ID } = req.data;

        if (!proposal_ID) {
            return req.reject(400, "Proposal ID is required.");
        }

        const proposal = await SELECT.one
            .from(Proposals)
            .where({ ID: proposal_ID });

        if (!proposal) {
            return req.reject(404, "Proposal not found.");
        }

        if (
            String(proposal.proposalStatus || "").trim().toUpperCase()
            !== "APPROVED"
        ) {
            return req.reject(
                400,
                "Equipment can only be allocated to an approved proposal."
            );
        }

        const productIds = await getProposalProductIds(proposal_ID);

        if (productIds.length === 0) {
            return [];
        }

        // Fetch equipment whose foreign key matches a requested product.
        // Status is checked in JavaScript because database values may
        // contain trailing spaces, such as "AVAILABLE ".
        const equipmentRecords = await SELECT
            .from(Rental_Physical_Equipment)
            .where({
                product_ref_ID: { in: productIds }
            })
            .orderBy("equipment_Code");

        return equipmentRecords.filter((equipment) => {
            return (
                productIds.includes(String(equipment.product_ref_ID)) &&
                normalizeStatus(equipment.status) === "AVAILABLE"
            );
        });
    });

    // --------------------------------------------------
    // GET EQUIPMENT HISTORY
    // --------------------------------------------------

    this.on("getEquipmentHistory", async (req) => {
        const { equipment_ID } = req.data;

        if (!equipment_ID) {
            return req.reject(400, "Equipment ID is required.");
        }

        const equipment = await SELECT.one
            .from(Rental_Physical_Equipment)
            .where({ ID: equipment_ID });

        if (!equipment) {
            return req.reject(404, "Equipment not found.");
        }

        return SELECT
            .from(RentalAllocations)
            .where({ equipment_ID });
    });

    // --------------------------------------------------
    // ALLOCATE EQUIPMENT
    //
    // Validates that:
    // 1. Proposal exists and is approved.
    // 2. Rental contract belongs to the proposal.
    // 3. Equipment exists.
    // 4. Equipment product_ref_ID matches a product in
    //    the selected proposal's ProposalItems.
    // 5. Equipment status is AVAILABLE.
    // 6. Rental dates fall within the contract period.
    // --------------------------------------------------

    this.on("allocationEquipment", async (req) => {
        const {
            proposal_ID,
            equipment_ID,
            startDate,
            endDate,
            rentalContract_ID
        } = req.data;

        // 1. Validate required inputs.

        if (!proposal_ID) {
            return req.reject(400, "Proposal ID is required.");
        }

        if (!equipment_ID) {
            return req.reject(400, "Equipment ID is required.");
        }

        if (!rentalContract_ID) {
            return req.reject(400, "Rental Contract ID is required.");
        }

        if (!startDate || !endDate) {
            return req.reject(
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
            return req.reject(400, "Invalid rental dates.");
        }

        if (start > end) {
            return req.reject(
                400,
                "Rental start date cannot be after the end date."
            );
        }

        // 3. Validate the proposal.

        const proposal = await SELECT.one
            .from(Proposals)
            .where({ ID: proposal_ID });

        if (!proposal) {
            return req.reject(404, "Proposal not found.");
        }

        if (
            String(proposal.proposalStatus || "").trim().toUpperCase()
            !== "APPROVED"
        ) {
            return req.reject(
                400,
                "Only approved proposals can be allocated."
            );
        }

        // 4. Validate the rental contract.

        const contract = await SELECT.one
            .from(RentalContracts)
            .where({ ID: rentalContract_ID });

        if (!contract) {
            return req.reject(404, "Rental contract not found.");
        }

        if (String(contract.proposal_ID) !== String(proposal_ID)) {
            return req.reject(
                400,
                "The rental contract does not belong to the selected proposal."
            );
        }

        if (
            contract.startDate &&
            contract.endDate
        ) {
            const contractStart = new Date(contract.startDate);
            const contractEnd = new Date(contract.endDate);

            if (
                Number.isNaN(contractStart.getTime()) ||
                Number.isNaN(contractEnd.getTime())
            ) {
                return req.reject(
                    400,
                    "The rental contract contains invalid dates."
                );
            }

            if (start < contractStart || end > contractEnd) {
                return req.reject(
                    400,
                    "Equipment allocation dates must fall within the rental contract period."
                );
            }
        }

        // 5. Read the selected physical equipment by its unique ID.

        const equipment = await SELECT.one
            .from(Rental_Physical_Equipment)
            .where({ ID: equipment_ID });

        if (!equipment) {
            return req.reject(404, "Selected equipment not found.");
        }

        // 6. Validate the foreign key against the proposal products.

        const productIds = await getProposalProductIds(proposal_ID);

        if (productIds.length === 0) {
            return req.reject(
                400,
                "The selected proposal has no products."
            );
        }

        const equipmentProductId = String(
            equipment.product_ref_ID || ""
        );

        if (!productIds.includes(equipmentProductId)) {
            return req.reject(
                400,
                "The selected equipment does not match any product in this proposal."
            );
        }

        // 7. Validate current equipment status.
        // This accepts "AVAILABLE" and "AVAILABLE " but rejects
        // AT_CUSTOMER, UNDER_MAINTENANCE, and other statuses.

        if (normalizeStatus(equipment.status) !== "AVAILABLE") {
            return req.reject(
                409,
                "The selected equipment is not available for allocation."
            );
        }

        // 8. Validate the customer before allocation.

        const customer = await SELECT.one
            .from(Customers)
            .where({ ID: proposal.customer_ID });

        if (!customer) {
            return req.reject(
                404,
                "The customer associated with the proposal was not found."
            );
        }

        // 9. Update the equipment status.
        // Match by unique physical equipment ID, not product_ref_ID.
        // Multiple physical equipment records can share one product FK.

        await UPDATE(Rental_Physical_Equipment)
            .set({ status: "AT_CUSTOMER" })
            .where({ ID: equipment_ID });

        // 10. Confirm the equipment status update.

        const updatedEquipment = await SELECT.one
            .from(Rental_Physical_Equipment)
            .where({ ID: equipment_ID });

        if (
            !updatedEquipment ||
            normalizeStatus(updatedEquipment.status) !== "AT_CUSTOMER"
        ) {
            return req.reject(
                500,
                "Failed to update the equipment allocation status."
            );
        }

        // 11. Create the allocation record.

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
                allocationStatus: "ALLOCATED",
                rentalContract_ID,
                equipment_ID
            });

            return (
                `Equipment ${equipment.equipment_Code || equipment_ID} ` +
                "allocated successfully."
            );
        } catch (error) {
            console.error(
                "Equipment allocation record creation failed:",
                error.message
            );

            // Restore availability if allocation creation fails.
            await UPDATE(Rental_Physical_Equipment)
                .set({ status: "AVAILABLE" })
                .where({ ID: equipment_ID });

            throw error;
        }
    });
});