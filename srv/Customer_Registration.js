const cds = require('@sap/cds');

module.exports = cds.service.impl(async function () {

    const { SELECT, INSERT } = cds.ql;
    const { Customers, Proposals } = this.entities;
    const { Product } = cds.entities('Master.db');

    // logged-in customer, matched by username
    const getCurrentCustomer = () =>
        SELECT.one.from(Customers).where({ username: cds.context.user.id });

    // ---------- Register ----------
    this.before('Register', async (req) => {
        const { companyName, companyType, contactPerson, customerEmail, phone,
                address, city, state, country, username, password } = req.data;

        if (!companyName || !companyType || !contactPerson || !customerEmail || !phone ||
            !address || !city || !state || !country || !username || !password) {
            return req.reject(400, 'Some fields are missing');
        }

        const prefix = companyType === 'Mining' ? 'MIN' : 'CUST';

        const last = await SELECT.one.from(Customers)
            .columns('customerCode')
            .where({ companyType })
            .orderBy('customerCode desc');

        const newNum = last ? parseInt(last.customerCode.split('-')[1], 10) + 1 : 1;
        req.data.customerCode = `${prefix}-${String(newNum).padStart(4, '0')}`;
    });

    this.on('Register', async (req) => {
        const d = req.data;
        return await INSERT.into(Customers).entries({
            customerCode: d.customerCode,
            companyName: d.companyName,
            companyType: d.companyType,
            contactPerson: d.contactPerson,
            customerEmail: d.customerEmail,
            phone: d.phone,
            address: d.address,
            city: d.city,
            state: d.state,
            country: d.country,
            username: d.username,
            password: d.password
        });
    });

    // ---------- Login ----------
    this.on('login', async (req) => {
        const { username, password } = req.data;

        const user = await SELECT.one.from(Customers).where({ username, password });
        if (!user) { return req.reject(401, 'Invalid Username or Password'); }

        return await SELECT.from(Proposals).where({ customer_ID: user.ID });
    });

    // ---------- Proposals: CREATE ----------
    this.before('CREATE', Proposals, async (req) => {
        const { items } = req.data;
        if (!items || !items.length) { return req.reject(400, 'Add at least one item.'); }

        const customer = await getCurrentCustomer();
        if (!customer) { return req.reject(403, 'No customer found for the logged-in user.'); }

        let totalAmountCalc = 0;

        for (const item of items) {
            const product = await SELECT.one.from(Product)
                .columns('basePrice')
                .where({ ID: item.product_ID });
            if (!product) { return req.reject(400, 'Invalid product selected.'); }

            const diff = new Date(item.endDate) - new Date(item.startDate);
            const days = diff / (1000 * 60 * 60 * 24) + 1;
            if (!(days > 0)) { return req.reject(400, 'End date is before start date.'); }

            const estimateAmount = item.quantity * product.basePrice * days;
            totalAmountCalc += estimateAmount;

            item.rentalDuration = days;
            item.unitPrice = product.basePrice;
            item.estimatedAmount = estimateAmount;
        }

        // next proposal number: PROP-0001, PROP-0002, ...
        const lastProposal = await SELECT.one.from(Proposals)
            .columns('proposalNumber')
            .where({ proposalNumber: { like: 'PROP-%' } })
            .orderBy('proposalNumber desc');
        const nextNum = lastProposal
            ? parseInt(lastProposal.proposalNumber.split('-')[1], 10) + 1 : 1;

        req.data.proposalNumber = `PROP-${String(nextNum).padStart(4, '0')}`;
        req.data.totalAmount = totalAmountCalc;
        req.data.proposalDate = new Date().toISOString().split('T')[0];
        req.data.proposalType = 'RENTAL';
        req.data.negotiateAmount = 0;
        req.data.customerRemarks = req.data.customerRemarks || 'NIL';
        req.data.submittedAt = new Date();
        req.data.customer_ID = customer.ID;
    });

    this.on('CREATE', Proposals, async (req, next) => {
        await next();
        return req.data;
    });

    // ---------- Proposals: READ (only the logged-in customer's rows) ----------
    // Adds a filter instead of replacing the read, so $filter, $orderby,
    // $top and $skip from the UI5 table (search, tiles, growing) keep working.
    this.before('READ', Proposals, async (req) => {
        const customer = await getCurrentCustomer();
        if (!customer) { return req.reject(403, 'No customer found for the logged-in user.'); }
        req.query.where({ customer_ID: customer.ID });
    });
});