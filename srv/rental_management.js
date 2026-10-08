const cds = require("@sap/cds");

module.exports = cds.service.impl(function () {

    const {
        RentalContracts,
        RentalAllocations,
        Rental_Physical_Equipment
    } = this.entities;


    // create rental contract
    this.on("createRentalContract", async (req) => {

        const {
            allocation_ID,
            contractNumber,
            contractDate,
            startDate,
            endDate,
            totalRentalAmount
        } = req.data;

        if (!allocation_ID) {
            return req.error(400, "Allocation ID is required");
        }

        if (!contractNumber) {
            return req.error(400, "Contract number is required");
        }

        if (!contractDate) {
            return req.error(400, "Contract date is required");
        }

        if (!startDate || !endDate) {
            return req.error(400, "Rental start date and end date are required");
        }

        if (new Date(startDate) > new Date(endDate)) {
            return req.error(400, "Start date cannot be greater than end date");
        }


        // Check allocation
        const allocation = await SELECT.one
            .from(RentalAllocations)
            .where({ ID: allocation_ID });

        if (!allocation) {
            return req.error(404, "Rental allocation not found");
        }


        // Allocation should not already have a rental contract
        if (allocation.rentalContract_ID) {
            return req.error(
                400,
                "Rental contract already exists for this allocation"
            );
        }


        // Allocation must be allocated
        if (allocation.allocationStatus !== "ALLOCATED") {
            return req.error(
                400,
                "Equipment must be allocated before creating the rental contract"
            );
        }


        // Check contract number
        const existingContract = await SELECT.one
            .from(RentalContracts)
            .where({ contractNumber: contractNumber });

        if (existingContract) {
            return req.error(
                400,
                "Contract number already exists"
            );
        }


        // Create rental contract
        const contract = await INSERT.into(RentalContracts).entries({
            contractNumber: contractNumber,
            contractDate: contractDate,
            startDate: startDate,
            endDate: endDate,
            totalRentalAmount: totalRentalAmount || 0,
            contractStatus: "ACTIVE"
        });


        // Link allocation with rental contract
        await UPDATE(RentalAllocations)
            .set({
                rentalContract_ID: contract[0].ID
            })
            .where({
                ID: allocation_ID
            });


        return `Rental contract ${contractNumber} created successfully`;
    });


    // Get Active Rentals
    this.on("getActiveRentals", async (req) => {

        const activeRentals = await SELECT
            .from(RentalContracts)
            .where({
                contractStatus: "ACTIVE"
            });

        return activeRentals;
    });


    // Check Rental Period
    this.on("checkRentalPeriod", async (req) => {

        const {
            contract_ID,
            startDate,
            endDate
        } = req.data;

        if (!contract_ID) {
            return req.error(400, "Contract ID is required");
        }

        if (!startDate || !endDate) {
            return req.error(
                400,
                "Start date and end date are required"
            );
        }

        if (new Date(startDate) > new Date(endDate)) {
            return req.error(
                400,
                "Start date cannot be greater than end date"
            );
        }


        const contract = await SELECT.one
            .from(RentalContracts)
            .where({
                ID: contract_ID
            });

        if (!contract) {
            return req.error(
                404,
                "Rental contract not found"
            );
        }


        if (contract.contractStatus !== "ACTIVE") {
            return req.error(
                400,
                "Rental contract is not active"
            );
        }


        // Check overlapping active rentals
        const existingRentals = await SELECT
            .from(RentalContracts)
            .where({
                contractStatus: "ACTIVE"
            });


        for (const rental of existingRentals) {

            if (rental.ID === contract_ID) {
                continue;
            }

            const existingStart = new Date(rental.startDate);
            const existingEnd = new Date(rental.endDate);

            const requestedStart = new Date(startDate);
            const requestedEnd = new Date(endDate);


            if (
                requestedStart <= existingEnd &&
                requestedEnd >= existingStart
            ) {
                return req.error(
                    400,
                    "Rental period overlaps with an existing active rental"
                );
            }
        }


        return "Rental period is available";
    });


    // complete rental

    this.on("completeRental", async (req) => {

        const {
            contract_ID
        } = req.data;

        if (!contract_ID) {
            return req.error(
                400,
                "Contract ID is required"
            );
        }


        const contract = await SELECT.one
            .from(RentalContracts)
            .where({
                ID: contract_ID
            });

        if (!contract) {
            return req.error(
                404,
                "Rental contract not found"
            );
        }


        if (contract.contractStatus !== "ACTIVE") {
            return req.error(
                400,
                "Rental contract is not active"
            );
        }


        // Get allocations belonging to this contract
        const allocations = await SELECT
            .from(RentalAllocations)
            .where({
                rentalContract_ID: contract_ID
            });


        if (allocations.length === 0) {
            return req.error(
                400,
                "No equipment allocation found for this rental contract"
            );
        }


        // Release allocated equipment
        for (const allocation of allocations) {

            if (!allocation.equipment_ID) {
                continue;
            }


            const equipment = await SELECT.one
                .from(Rental_Physical_Equipment)
                .where({
                    ID: allocation.equipment_ID
                });


            if (equipment) {

                await UPDATE(Rental_Physical_Equipment)
                    .set({
                        equipmentStatus: "AVAILABLE"
                    })
                    .where({
                        ID: equipment.ID
                    });
            }


            // Update allocation status
            await UPDATE(RentalAllocations)
                .set({
                    allocationStatus: "RELEASED"
                })
                .where({
                    ID: allocation.ID
                });
        }


        // Complete rental contract
        await UPDATE(RentalContracts)
            .set({
                contractStatus: "COMPLETED"
            })
            .where({
                ID: contract_ID
            });


        return "Rental completed successfully";
    });


    // get rental history
    
    this.on("getRentalHistory", async (req) => {

        const rentalHistory = await SELECT
            .from(RentalContracts)
            .where({
                contractStatus: {
                    in: [
                        "COMPLETED",
                        "CANCELLED"
                    ]
                }
            });

        return rentalHistory;
    });

});