const cds = require("@sap/cds");

module.exports = cds.service.impl(function () {

    const {
        Proposals,
        RentalContracts,
        RentalAllocations,
        Rental_Physical_Equipment
    } = this.entities;


    function normalizeStatus(value) {

        return String(
            value || ""
        )
            .trim()
            .toUpperCase();

    }


    // =========================================================
    // CREATE RENTAL CONTRACT
    // =========================================================

    this.on("createRentalContract", async (req) => {

        const {
            proposal_ID,
            contractNumber,
            contractDate,
            startDate,
            endDate,
            totalRentalAmount
        } = req.data;


        // -------------------------------------------------
        // 1. Proposal ID validation
        // -------------------------------------------------

        if (!proposal_ID) {

            return req.error(
                400,
                "Proposal ID is required"
            );
        }


        // -------------------------------------------------
        // 2. Contract number validation
        // -------------------------------------------------

        if (
            !contractNumber ||
            !String(contractNumber).trim()
        ) {

            return req.error(
                400,
                "Contract number is required"
            );
        }


        // -------------------------------------------------
        // 3. Contract date validation
        // -------------------------------------------------

        if (!contractDate) {

            return req.error(
                400,
                "Contract date is required"
            );
        }


        // -------------------------------------------------
        // 4. Start date validation
        // -------------------------------------------------

        if (!startDate) {

            return req.error(
                400,
                "Rental start date is required"
            );
        }


        // -------------------------------------------------
        // 5. End date validation
        // -------------------------------------------------

        if (!endDate) {

            return req.error(
                400,
                "Rental end date is required"
            );
        }


        // -------------------------------------------------
        // 6. Total amount validation
        // -------------------------------------------------

        if (
            totalRentalAmount === undefined ||
            totalRentalAmount === null ||
            isNaN(Number(totalRentalAmount))
        ) {

            return req.error(
                400,
                "Valid total rental amount is required"
            );
        }


        // -------------------------------------------------
        // 7. Date validation
        // -------------------------------------------------

        const oStartDate =
            new Date(startDate);

        const oEndDate =
            new Date(endDate);


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
        // 8. Get proposal
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
        // 9. Proposal must be approved
        // -------------------------------------------------

        if (
            normalizeStatus(
                oProposal.proposalStatus
            ) !== "APPROVED"
        ) {

            return req.error(
                400,
                "Rental contract can be created only for approved proposals"
            );
        }


        // -------------------------------------------------
        // 10. Customer must exist in proposal AND in Customers table
        // -------------------------------------------------

        if (!oProposal.customer_ID) {

            return req.error(
                400,
                "Customer is not assigned to this proposal"
            );
        }

        const { Customers } = cds.entities("Master.db");

        const oCustomer = await SELECT
            .one
            .from(Customers)
            .columns("ID")
            .where({ ID: oProposal.customer_ID });

        if (!oCustomer) {

            return req.error(
                400,
                "Customer of this proposal does not exist"
            );
        }


        // -------------------------------------------------
        // 11. Contract number must be unique
        //     (trim + uppercase: "con-1" and "CON-1" are the same)
        // -------------------------------------------------

        const sContractNumber =
            String(contractNumber).trim().toUpperCase();

        const oExistingContract = await SELECT
            .one
            .from(RentalContracts)
            .columns("ID")
            .where({ contractNumber: sContractNumber });

        if (oExistingContract) {

            return req.error(
                409,
                `Rental contract number ${sContractNumber} already exists`
            );
        }


        // -------------------------------------------------
        // 12. Create rental contract (a proposal can have more than one contract)
        //     customer_ID always comes from the proposal, never from the UI
        // -------------------------------------------------

        const sRentalContractId = cds.utils.uuid();

        try {

            await INSERT
                .into(RentalContracts)
                .entries({
                    ID: sRentalContractId,
                    proposal_ID: proposal_ID,
                    customer_ID: oProposal.customer_ID,
                    contractNumber: sContractNumber,
                    contractDate: contractDate,
                    startDate: startDate,
                    endDate: endDate,
                    totalRentalAmount: Number(totalRentalAmount),
                    contractStatus: "Active"
                });

        } catch (oError) {

            // two users saving the same number at the same time
            if (/unique|constraint|duplicate/i.test(oError.message)) {

                return req.error(
                    409,
                    `Rental contract number ${sContractNumber} already exists`
                );
            }

            throw oError;
        }


        return sRentalContractId;

    });


    // =========================================================
    // GET ACTIVE RENTALS
    // =========================================================

    this.on("getActiveRentals", async (req) => {

        const aActiveRentals = await SELECT
            .from(RentalContracts)
            .where({
                contractStatus: "Active"
            });


        return aActiveRentals;

    });


    // =========================================================
    // CHECK RENTAL PERIOD
    // =========================================================

    this.on("checkRentalPeriod", async (req) => {

        const {
            contract_ID,
            startDate,
            endDate
        } = req.data;


        if (!contract_ID) {

            return req.error(
                400,
                "Contract ID is required"
            );
        }


        if (!startDate || !endDate) {

            return req.error(
                400,
                "Start date and end date are required"
            );
        }


        const oStartDate =
            new Date(startDate);

        const oEndDate =
            new Date(endDate);


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
                "Start date cannot be greater than end date"
            );
        }


        const oContract =
            await SELECT
                .one
                .from(RentalContracts)
                .where({
                    ID: contract_ID
                });


        if (!oContract) {

            return req.error(
                404,
                "Rental contract not found"
            );
        }


        if (
            normalizeStatus(
                oContract.contractStatus
            ) !== "ACTIVE"
        ) {

            return req.error(
                400,
                "Rental contract is not active"
            );
        }


        const aExistingRentals =
            await SELECT
                .from(RentalContracts)
                .where({
                    contractStatus: "Active"
                });


        for (
            const oRental
            of aExistingRentals
        ) {

            if (
                oRental.ID === contract_ID
            ) {

                continue;
            }


            if (
                !oRental.startDate ||
                !oRental.endDate
            ) {

                continue;
            }


            const oExistingStart =
                new Date(oRental.startDate);

            const oExistingEnd =
                new Date(oRental.endDate);


            if (
                oStartDate <= oExistingEnd &&
                oEndDate >= oExistingStart
            ) {

                return req.error(
                    400,
                    "Rental period overlaps with an existing active rental"
                );
            }

        }


        return "Rental period is available";

    });


    // =========================================================
    // COMPLETE RENTAL CONTRACT
    // =========================================================

    this.on("completeRentalContract", async (req) => {

        const {
            contract_ID
        } = req.data;


        if (!contract_ID) {

            return req.error(
                400,
                "Contract ID is required"
            );
        }


        // -------------------------------------------------
        // Get contract
        // -------------------------------------------------

        const oContract =
            await SELECT
                .one
                .from(RentalContracts)
                .where({
                    ID: contract_ID
                });


        if (!oContract) {

            return req.error(
                404,
                "Rental contract not found"
            );
        }


        // -------------------------------------------------
        // Contract must be active
        // -------------------------------------------------

        if (
            normalizeStatus(
                oContract.contractStatus
            ) !== "ACTIVE"
        ) {

            return req.error(
                400,
                "Rental contract is not active"
            );
        }


        // -------------------------------------------------
        // Get allocations
        // -------------------------------------------------

        const aAllocations =
            await SELECT
                .from(RentalAllocations)
                .where({
                    rentalContract_ID:
                        contract_ID
                });


        if (
            !aAllocations ||
            aAllocations.length === 0
        ) {

            return req.error(
                400,
                "No equipment is allocated to this rental contract"
            );
        }


        // -------------------------------------------------
        // Release equipment
        // -------------------------------------------------

        for (
            const oAllocation
            of aAllocations
        ) {

            if (!oAllocation.equipment_ID) {

                continue;
            }


            await UPDATE(
                Rental_Physical_Equipment
            )
                .set({
                    status: "AVAILABLE"
                })
                .where({
                    ID:
                        oAllocation.equipment_ID
                });


            await UPDATE(
                RentalAllocations
            )
                .set({
                    allocationStatus:
                        "Released"
                })
                .where({
                    ID:
                        oAllocation.ID
                });

        }


        // -------------------------------------------------
        // Complete rental contract
        // -------------------------------------------------

        await UPDATE(
            RentalContracts
        )
            .set({
                contractStatus:
                    "Completed"
            })
            .where({
                ID:
                    contract_ID
            });


        return (
            "Rental contract completed and equipment released successfully"
        );

    });


    // =========================================================
    // GET RENTAL HISTORY
    // =========================================================

    this.on("getRentalHistory", async (req) => {

        const aRentalHistory =
            await SELECT
                .from(RentalContracts)
                .where({
                    contractStatus: {
                        in: [
                            "Completed",
                            "Cancelled"
                        ]
                    }
                });


        return aRentalHistory;

    });

});