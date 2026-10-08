const cds = require("@sap/cds");

module.exports = cds.service.impl(function () {

    const {
        Proposals,
        ProposalItems,
        RentalContracts, 
        RentalAllocations,
        Rental_Physical_Equipment,
        RentalContracts
    } = this.entities;


    // get approved approvals 

    this.on("getApprovedProposals", async (req) => {

        const aProposals = await SELECT
            .from(Proposals)
            .where({
                proposalStatus: "Approved"
            });

        return aProposals;
    });


    // read approved proposals only (keeps key / $filter / $top of the UI working)

    this.before("READ", Proposals, (req) => {
        req.query.where({ proposalStatus: "Approved" });
    });


    // =========================================================
    // GET PROPOSAL ITEMS
    // =========================================================

    this.on("getProposalItems", async (req) => {

        const {
            proposal_ID
        } = req.data;


        if (!proposal_ID) {

            return req.error(
                400,
                "Proposal ID is required"
            );
        }


        const oProposal = await SELECT
            .one
            .from(Proposals)
            .where({
                ID: proposal_ID
            });


        if (!oProposal) {

            return req.error(
                404,
                "Proposal not found"
            );
        }


        const aItems = await SELECT
            .from(ProposalItems)
            .where({
                proposals_ID: proposal_ID
            });


        return aItems;
    });


    // =========================================================
    // GET AVAILABLE EQUIPMENT
    // =========================================================

    this.on("getAvailableEquipment", async (req) => {

        const { proposal_ID } = req.data;

        if (!proposal_ID) {
            return req.error(400, "Proposal ID is required");
        }

        // 1. Products requested in this proposal
        const aItems = await SELECT
            .from(ProposalItems)
            .columns("product_ID")
            .where({ proposals_ID: proposal_ID });

        const aProductIds = [
            ...new Set(aItems.map(o => o.product_ID).filter(Boolean))
        ];

        if (aProductIds.length === 0) {
            return [];
        }

        // 2. Equipment of those products whose status is AVAILABLE
        //    (status is the single source of truth:
        //     allocation sets AT_CUSTOMER, completing the rental sets AVAILABLE)
        return SELECT
            .from(Rental_Physical_Equipment)
            .where({
                product_ref_ID: { in: aProductIds },
                status: "AVAILABLE"
            })
            .orderBy("equipment_Code");
    });


    // =========================================================
    // GET EQUIPMENT HISTORY
    // =========================================================

    this.on("getEquipmentHistory", async (req) => {

        const {
            equipment_ID
        } = req.data;


        if (!equipment_ID) {

            return req.error(
                400,
                "Equipment ID is required"
            );
        }


        const oEquipment = await SELECT
            .one
            .from(Rental_Physical_Equipment)
            .where({
                ID: equipment_ID
            });


        if (!oEquipment) {

            return req.error(
                404,
                "Equipment not found"
            );
        }


        const aHistory = await SELECT
            .from(RentalAllocations)
            .where({
                equipment_ID: equipment_ID
            });


        return aHistory;
    });


    // =========================================================
    // ALLOCATE EQUIPMENT
    // =========================================================

    this.on("allocationEquipment", async (req) => {

        try {

            const {
                proposal_ID,
                equipment_ID,
                startDate,
                endDate,
                rentalContract_ID
            } = req.data;


            // -------------------------------------------------
            // 1. Proposal validation
            // -------------------------------------------------

            if (!proposal_ID) {

                return req.error(
                    400,
                    "Proposal ID is required"
                );
            }


            // -------------------------------------------------
            // 2. Equipment validation
            // -------------------------------------------------

            if (!equipment_ID) {

                return req.error(
                    400,
                    "Equipment ID is required"
                );
            }


            // -------------------------------------------------
            // 3. Rental Contract validation
            // -------------------------------------------------

            if (!rentalContract_ID) {

                return req.error(
                    400,
                    "Rental Contract ID is required"
                );
            }


            // -------------------------------------------------
            // 4. Date validation
            // -------------------------------------------------

            if (!startDate) {

                return req.error(
                    400,
                    "Rental start date is required"
                );
            }


            if (!endDate) {

                return req.error(
                    400,
                    "Rental end date is required"
                );
            }


            const oStartDate = new Date(startDate);
            const oEndDate = new Date(endDate);


            if (
                isNaN(oStartDate.getTime()) ||
                isNaN(oEndDate.getTime())
            ) {

                return req.error(
                    400,
                    "Invalid rental dates"
                );
            }


            if (oStartDate > oEndDate) {

                return req.error(
                    400,
                    "Rental start date cannot be after end date"
                );
            }


            // -------------------------------------------------
            // 5. Check proposal
            // -------------------------------------------------

            const oProposal = await SELECT
                .one
                .from(Proposals)
                .where({
                    ID: proposal_ID
                });


            if (!oProposal) {

                return req.error(
                    404,
                    "Proposal not found"
                );
            }


            // -------------------------------------------------
            // 6. Check rental contract
            // -------------------------------------------------

            const oContract = await SELECT
                .one
                .from(RentalContracts)
                .where({
                    ID: rentalContract_ID
                });


            if (!oContract) {

                return req.error(
                    404,
                    "Rental contract not found"
                );
            }


            // -------------------------------------------------
            // 7. Contract must belong to proposal
            // -------------------------------------------------

            if (
                oContract.proposal_ID !== proposal_ID
            ) {

                return req.error(
                    400,
                    "Rental contract does not belong to the selected proposal"
                );
            }


            // -------------------------------------------------
            // 8. Check equipment
            // -------------------------------------------------

            const oEquipment = await SELECT
                .one
                .from(Rental_Physical_Equipment)
                .where({
                    ID: equipment_ID
                });


            if (!oEquipment) {

                return req.error(
                    404,
                    "Selected equipment not found"
                );
            }


            // -------------------------------------------------
            // 9. Equipment must be AVAILABLE
            // -------------------------------------------------

            const sStatus = String(
                oEquipment.status || ""
            ).toUpperCase();


            if (sStatus !== "AVAILABLE") {

                return req.error(
                    400,
                    "Selected equipment is not available"
                );
            }


            // -------------------------------------------------
            // 10. Equipment must belong to a product of this proposal
            // -------------------------------------------------

            const oProductItem = await SELECT
                .one
                .from(ProposalItems)
                .columns("ID")
                .where({
                    proposals_ID: proposal_ID,
                    product_ID: oEquipment.product_ref_ID
                });

            if (!oProductItem) {

                return req.error(
                    400,
                    "Selected equipment does not belong to the products of this proposal"
                );
            }


            // -------------------------------------------------
            // 11. Generate allocation number
            // -------------------------------------------------

            const sAllocationNumber =
                "ALLOC-" + Date.now();


            // -------------------------------------------------
            // 12. Create allocation
            // -------------------------------------------------

            await INSERT
                .into(RentalAllocations)
                .entries({

                    allocationNumber: sAllocationNumber,

                    allocationDate: new Date(),

                    allocationStartDate: startDate,

                    allocationEndDate: endDate,

                    allocationStatus: "Allocated",

                    rentalContract_ID: rentalContract_ID,

                    equipment_ID: equipment_ID

                });


            // -------------------------------------------------
            // 13. Update equipment status
            // -------------------------------------------------

            await UPDATE(
                Rental_Physical_Equipment
            )
                .set({
                    status: "AT_CUSTOMER"
                })
                .where({
                    ID: equipment_ID
                });


            return "Equipment allocated successfully";


        } catch (error) {

            console.error(
                "ALLOCATION EQUIPMENT ERROR:",
                error
            );

            return req.error(
                500,
                error.message ||
                "Equipment allocation failed"
            );
        }

    });

});