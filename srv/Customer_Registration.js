const cds = require('@sap/cds');
const { data } = require('@sap/cds/lib/dbs/cds-deploy');
const { SELECT, INSERT } = require('@sap/cds/lib/ql/cds-ql');

module.exports = cds.service.impl(async function () {

    const {Customers, Proposals, ProposalItems} = this.entities;


    this.before('Register', async (req, res)  => {

        const {companyName, companyType, contactPerson, customerEmail, phone, address, city, state, country, username, password} = req.data;

        //console.log(companyName, companyType, contactPerson, customerEmail, phone, address, city, state, country, username, password);

        if(!companyName || !companyType || !contactPerson || !customerEmail || !phone || !address || !city || !state || !country || !username || !password ) {
            req.error('Some Fields are missing');
        }

        let prefix = "";

        if(companyType === "Construction"){
            prefix = "CUST"
        } else if(companyType === "Mining"){
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

        const dbUserName = userExists.username;
        const dbPassword = userExists.password;

        if(username !== dbUserName && password !== dbPassword){
            req.reject('Invalid Username or Password');
        }

        // if(!userExists) {
        //     req.reject('Invalid Username or Password');
        // }

    })

    this.on('login', async (req, res) => {
        
        const {username, password} = req.data;

        const userExists = await SELECT.one.from(Customers).where({username : username, password : password});
        console.log("users : ", userExists);
        
        const dbUserName = userExists.username;
        const dbPassword = userExists.password;
        console.log("Username : ", dbUserName, dbPassword);
        

        if(username === dbUserName && password === dbPassword){
            const getProposal = await SELECT.from(Proposals).where({customer_ID : userExists.ID});
            return getProposal;
        }

    })


    this.before('CREATE', Proposals, async (req, res) => {

        const {proposalNumber, items} = req.data;
        // console.log("To before handlers : ", req.data);

        console.log("methods : ", req.method);
        console.log("Path : ", req.path);
        
        

        totalAmountCalc = 0;

        
        for(let data of items) {


            const productData = await SELECT.one.from('Product').columns('basePrice').where({ID : data.product_ID});
           

            const diff = new Date(data.endDate) - new Date(data.startDate);
            
            const days = (diff)/(1000 * 60 * 60 * 24) + 1;
            
            
            const estimateAmount = (data.quantity * productData.basePrice) * days ;
           

            totalAmountCalc += estimateAmount;

            data.rentalDuration = days;
            data.unitPrice = productData.basePrice;
            data.estimatedAmount = estimateAmount;
        }

        const userData = cds.context.user.id;
        console.log("user Data : ", userData);
        
        
        const customerData = await SELECT.one.from(Customers).where({username : userData});
        console.log("customer Data : ", customerData);
        

        const currDate = new Date().toISOString().split("T")[0];
        // console.log("Curr Date : ", currDate);
        
        // const date = currDate.split();
        // console.log("Date : ", date);
        

        req.data.totalAmount = totalAmountCalc;
        req.data.proposalDate = currDate;
        req.data.proposalType = "RENTAL";
        req.data.negotiateAmount = 0;
        req.data.customerRemarks = "NIL";
        req.data.submittedAt = new Date();
        req.data.customer_ID = customerData.ID;

        // console.log("Before Handlers : ", req.data);
        
    })


    this.on('CREATE', Proposals, async (req, next) =>{

        const res = await next();
        return req.data;

        // console.log("On Handlers : ", req.data);
        
        // const proposalDatas = await INSERT.into(Proposals).entries(req.data)
        // console.log("Proposal Data : ", proposalDatas);

        // return proposalDatas;
        
    })

    
    this.on('READ', Proposals, async (req, res) => {

        console.log("cds context : ", req.context);

        console.log("methods : ", req.method);
        console.log("Path : ", req.path);
        console.log("Headers : ", req.headers);
        
        const username = req.context;
        const usernameValue = username.user.id;
        console.log("Username : ", usernameValue);

        const customerData = await SELECT.one.from(Customers).where({username : usernameValue});
        
        //const proposalData = await SELECT.from(Proposals);
        const proposalData = await SELECT.from(Proposals).where({customer_ID : customerData.ID});
        console.log("Proposal Data : ", proposalData);
        
        return proposalData;
    });

})
