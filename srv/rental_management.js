const cds = require('@sap/cds');

module.exports = cds.service.impl(function () {

    const {
        Proposals,
        RentalContracts,
        RentalAllocations,
        Rental_Physical_Equipment
    } = this.entities;


    // Create rental contract

    this.on('createRentalContract', async (req) => {

        const {
            proposal_ID,
            customer_ID,
            contractNumber,
            contractDate,
            startDate,
            endDate,
            totalRentalAmount
        } = req.data;


        // This is for Basic validation

        if (!proposal_ID) {
            return req.error(400, 'Proposal ID is required');
        }

        if (!customer_ID) {
            return req.error(400, 'Customer ID is required');
        }

        if (!contractNumber) {
            return req.error(400, 'Contract number is required');
        }

        if (!contractDate) {
            return req.error(400, 'Contract date is required');
        }

        if (!startDate) {
            return req.error(400, 'Rental start date is required');
        }

        if (!endDate) {
            return req.error(400, 'Rental end date is required');
        }


        // Validate dates

        if (new Date(startDate) > new Date(endDate)) {
            return req.error(
                400,
                'Rental start date cannot be after end date'
            );
        }


        // check proposal

        const proposal = await SELECT.one
            .from(Proposals)
            .where({
                ID: proposal_ID
            });

        if (!proposal) {
            return req.error(404, 'Proposal not found');
        }


        // Only approved proposal

        if (proposal.proposalStatus !== 'Approved') {
            return req.error(
                400,
                'Rental contract can be created only for approved proposals'
            );
        }


        // Check duplicate contract number

        const existingContract = await SELECT.one
            .from(RentalContracts)
            .where({
                contractNumber: contractNumber
            });

        if (existingContract) {
            return req.error(
                400,
                'Rental contract number already exists'
            );
        }


        // Check proposal already has contract

        const existingProposalContract = await SELECT.one
            .from(RentalContracts)
            .where({
                proposal_ID: proposal_ID
            });

        if (existingProposalContract) {
            return req.error(
                400,
                'Rental contract already exists for this proposal'
            );
        }


        // Create rental contract

        await INSERT.into(RentalContracts).entries({

            proposal_ID: proposal_ID,

            customer_ID: customer_ID,

            contractNumber: contractNumber,

            contractDate: contractDate,

            startDate: startDate,

            endDate: endDate,

            totalRentalAmount: totalRentalAmount,

            contractStatus: 'Active'
        });


        return `Rental contract ${contractNumber} created successfully`;
    });


    // =========================================================
    // 2. COMPLETE RENTAL CONTRACT
    // =========================================================

    this.on('completeRentalContract', async (req) => {

        const { contract_ID } = req.data;


        // -----------------------------------------------------
        // Basic validation
        // -----------------------------------------------------

        if (!contract_ID) {
            return req.error(400, 'Contract ID is required');
        }


        // -----------------------------------------------------
        // Check contract
        // -----------------------------------------------------

        const contract = await SELECT.one
            .from(RentalContracts)
            .where({
                ID: contract_ID
            });

        if (!contract) {
            return req.error(
                404,
                'Rental contract not found'
            );
        }


        // -----------------------------------------------------
        // Check contract status
        // -----------------------------------------------------

        if (contract.contractStatus === 'Completed') {
            return req.error(
                400,
                'Rental contract is already completed'
            );
        }


        // -----------------------------------------------------
        // Get allocated equipment
        // -----------------------------------------------------

        const allocations = await SELECT.from(RentalAllocations)
            .where({
                rentalContract_ID: contract_ID
            });

        if (!allocations.length) {
            return req.error(
                400,
                'No equipment is allocated to this rental contract'
            );
        }


        // -----------------------------------------------------
        // Release every allocated equipment
        // -----------------------------------------------------

        for (const allocation of allocations) {

            await UPDATE(Rental_Physical_Equipment)
                .set({
                    status: 'AVAILABLE'
                })
                .where({
                    ID: allocation.equipment_ID
                });


            // -------------------------------------------------
            // Keep allocation record for history
            // -------------------------------------------------

            await UPDATE(RentalAllocations)
                .set({
                    allocationStatus: 'RELEASED'
                })
                .where({
                    ID: allocation.ID
                });
        }


        // -----------------------------------------------------
        // Complete rental contract
        // -----------------------------------------------------

        await UPDATE(RentalContracts)
            .set({
                contractStatus: 'Completed'
            })
            .where({
                ID: contract_ID
            });


        // -----------------------------------------------------
        // Notification placeholder
        // -----------------------------------------------------

        console.log(
            `Notification: Rental contract ${contract.contractNumber} completed`
        );


        return 'Rental contract completed and equipment released successfully';
    });

});
