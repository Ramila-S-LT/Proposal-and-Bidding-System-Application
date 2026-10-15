
const cds = require("@sap/cds");


module.exports = cds.service.impl(function () {
    console.log("equipment_allocation.js loaded");

    const { SELECT, INSERT, UPDATE } = cds.ql;

    const {
        Proposals,
        ProposalItems,
        RentalContracts,
        RentalAllocations,
        Rental_Physical_Equipment
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

        if (normalizeStatus(proposal.proposalStatus) !== "APPROVED") {
            return req.error(
                400,
                "Items can be retrieved only for approved proposals."
            );
        }

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

        if (normalizeStatus(proposal.proposalStatus) !== "APPROVED") {
            return req.error(
                400,
                "Equipment can be selected only for approved proposals."
            );
        }

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

        if (!proposal) {
            return req.error(404, "Proposal not found.");
        }

        if (normalizeStatus(proposal.proposalStatus) !== "APPROVED") {
            return req.error(
                400,
                "Equipment can be allocated only to an approved proposal."
            );
        }

        // 4. Check the rental contract.
        const contract = await SELECT.one
            .from(RentalContracts)
            .where({ ID: rentalContract_ID });

        if (!contract) {
            return req.error(404, "Rental contract not found.");
        }

        if (normalizeStatus(contract.contractStatus) !== "ACTIVE") {
            return req.error(
                400,
                "Equipment can be allocated only to an active rental contract."
            );
        }

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

        if (normalizeStatus(equipment.status) !== "AVAILABLE") {
            return req.error(
                400,
                "Selected equipment is no longer available."
            );
        }

        // 8. Verify that the equipment product was requested
        //    in this proposal.
        const matchingItem = await SELECT.one
            .from(ProposalItems)
            .columns("ID")
            .where({
                proposals_ID: proposal_ID,
                product_ID: equipment.product_ref_ID
            });

        if (!matchingItem) {
            return req.error(
                400,
                "Selected equipment does not match any product requested in this proposal."
            );
        }

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

            if (
                !updatedEquipment ||
                normalizeStatus(updatedEquipment.status) !== "AT_CUSTOMER"
            ) {
                throw new Error(
                    "Equipment status could not be updated. Please check the allocation."
                );
            }

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
