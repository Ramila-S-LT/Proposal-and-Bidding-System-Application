const cds = require('@sap/cds');

module.exports = cds.service.impl(async function () {

    const {Customers, Proposals, ProposalItems} = this.entities;

    // this.before('CREATE', Customers, async (req, res) => {

    // } )

    this.before('Register', async (req, res)  => {

        const {companyName, companyType, contactPerson, customerEmail, phone, address, city, state, country, username, password} = req.data;

        console.log(companyName, companyType, contactPerson, customerEmail, phone, address, city, state, country, username, password);

        let prefix = "";

        if(companyType === "Construction"){
            prefix = "CUST"
        } else if (companyType === "Mining"){
            prefix = "MIN"
        }

        const customerDetails = await SELECT.one.from(Customers).columns('customerCode').where({companyType}).orderBy('customerCode desc');

        let newNum = 1;

        if(customerDetails) {
            const number = parseInt(customerDetails.customerCode.split('-')[1]);
            newNum = number + 1;
        }

        req.data.customerCode = `${prefix}-${String(newNum).padStart(4, '0')}`;
        console.log(req.data.customerCode);
        
    })

    this.on('Register', async (req, res) => {

        //const data = req.data;

        const registerData = await INSERT.into(Customers).entries({
            customerCode : req.data.customerCode,
            companyName : req.data.companyName,
            companyType : req.data.companyType,
            contactPerson : req.data.contactPerson,
            customerEmail : req.data.customerEmail,
            phone : req.data.phone,
            address : req.data.address,
            city : req.data.city,
            state : req.data.state,
            country : req.data.country,
            username : req.data.username,
            password : req.data.password
        })

        return registerData;

    })

    this.before('login', async (req, res) => {

        const {username, password} = req.data;

        const userExists = await SELECT.one.from(Customers).where({username : username, password : password});

        if(!userExists) {
            req.reject('Invalid Username or Password');
        }

    })

    this.on('login', async (req, res) => {
        
        const {username, password} = req.data;

        const userExists = await SELECT.one.from(Customers).columns('ID').where({username : username, password : password});

        const getPropoaal = await SELECT.from(Proposals).where({customer_ID : userExists.ID});

        return getPropoaal;

    })

})
