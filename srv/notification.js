const cds = require("@sap/cds");

module.exports = cds.service.impl(async function () {

    this.on("sendCustomerNotification", async (req) => {

        const {
            customer_ID,
            message
        } = req.data;


        if (!customer_ID) {
            return req.reject(
                400,
                "Customer ID is required"
            );
        }


        if (!message) {
            return req.reject(
                400,
                "Notification message is required"
            );
        }


        console.log(
            "Customer Notification"
        );

        console.log(
            "Customer:",
            customer_ID
        );

        console.log(
            "Message:",
            message
        );


        return "Customer notification sent successfully";
    });

});