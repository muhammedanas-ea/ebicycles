const User = require('../models/userModel');
const Order = require('../models/orderModel');
const Product = require('../models/productModal');
const bcrypt = require('bcrypt');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const ExcelJS = require('exceljs');


let message = '';



//=========================== ADMIN LOGIN PAGE SHOWING SECTION START ===========================//

const loadLogin = async(req,res,next)=>{
  try{
      res.render('login');
  }
  catch(err){
      next(err);
  }
}



//=========================== ADMIN VERIFY LOGIN SECTION START ===========================//

const verifyLogin = async(req,res,next)=>{
  try{  
    const email = req.body.email;
    const password = req.body.password;
    const userData = await User.findOne({email:email});

    if(userData){
        const passwordMatch = await bcrypt.compare(password,userData.password);
        if(passwordMatch){
            if(userData.is_admin === 0){
                res.render('login',{message:'Email and password is incorrect'});
            }else{
                req.session.auser_id = userData._id;
                res.redirect('/admin/home');
            }
        }else{
            res.render('login',{message:'Email and password is incorrect'});
        }
    }else{
        message='Email and Password is incorrect'
        res.render('login');
    }
  }
  catch(err){
      next(err);
  }
}



//=========================== ADMIN HOME SHOWING SECTION START ===========================//

const loadDashbord = async (req, res, next) => {
  try {
    const adminData = await User.findById({ _id: req.session.auser_id });
    const users = await User.find({ is_block: false });
    const totalOrders = await Order.find();
    const totalProducts = await Product.find({ is_delete: false });

    const totalSaleResult = await Order.aggregate([
      {
        $match: {
          'products.status': 'Delivered'
        }
      },
      {
        $group: {
          _id: null,
          totalSale: {
            $sum: '$totalAmount'
          }
        }
      }
    ]);

    let totalSale = 0;
    if (totalSaleResult.length > 0) {
      totalSale = totalSaleResult[0].totalSale;
    }else {
      console.log('No orders found.');
    }

    const totalCodResult = await Order.aggregate([
      {
        $unwind: '$products'
      },
      {
        $match: { 'products.status': 'Delivered', paymentMethod: 'COD' }
      },
      {
        $group: {
          _id: null,
          totalCodAmount: { $sum: '$products.totalPrice' }
        }
      }
    ]);

    let totalCod = 0;
    if (totalCodResult.length > 0) {
      totalCod = totalCodResult[0].totalCodAmount;
    } else {
      console.log('No COD orders found.');
    }

    const totalOnlinePaymentResult = await Order.aggregate([
      {
        $unwind: '$products'
      },
      {
        $match: { 'products.status': 'Delivered', paymentMethod: 'onlinPayment' }
      },
      {
        $group: {
          _id: null,
          totalCodAmount: { $sum: '$products.totalPrice' }
        }
      }
    ]);

    let totalOnline = 0;
    if (totalOnlinePaymentResult.length > 0) {
      totalOnline = totalOnlinePaymentResult[0].totalCodAmount;
    } else {
      console.log('No online orders found.');
    }

    const totalWalletResult = await Order.aggregate([
      {
        $unwind: '$products'
      },
      {
        $match: { 'products.status': 'Delivered', paymentMethod: 'walletpayment' }
      },
      {
        $group: {
          _id: null,
          totalCodAmount: { $sum: '$products.totalPrice' }
        }
      }
    ]);

    let totalWallet = 0;
    if (totalWalletResult.length > 0) {
      totalWallet = totalWalletResult[0].totalCodAmount;
    } else {
      console.log('No wallet orders found.');
    }

    res.render('home', {
      admin: adminData,
      activePage: 'home',
      users,
      totalOrders,
      totalProducts,
      totalSale,
      totalCod,
      totalOnline,
      totalWallet,
    });

  } catch (err) {
    next(err);
  }
};



//=========================== ADMIN SALES REPORT SHOWING SECTION START ===========================//

const loadSalesReport = async (req,res,next) =>{
  try{
    const adminData = await User.findById(req.session.auser_id); 

    const order = await Order.aggregate([
      { $unwind: "$products" },
      { $match: { 'products.status': 'Delivered' } },
      { $sort: { date: -1 } },
      {
        $lookup: {
          from: 'products',
          let: { productId: { $toObjectId: '$products.productId' } },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$productId'] } } }
          ],
          as: 'products.productDetails'
        }
      },  
      {
        $addFields: {
          'products.productDetails': { $arrayElemAt: ['$products.productDetails', 0] }
        }
      }
    ]);

    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const orderCount = order.length;
    const totalPages = Math.ceil(orderCount / limit);
    const paginatedOrder = order.slice(startIndex, endIndex);

    res.render('saleReport', {
      admin: adminData,
      activePage: 'saleReport',
      order: paginatedOrder,
      currentPage: page,
      totalPages: totalPages,
      startDate:0,
      endDate:0
    });

  }catch(err){
    next(err)
  }
}



//=========================== ADMIN SIDE SALES REPORT SORTING SECTION START ===========================//

const salesReportSort = async (req,res,next) =>{
  try{
    const startDate = req.body.startDate;
    const endDate = req.body.endDate;

    const adminData = await User.findById(req.session.auser_id);
    
    const order = await Order.aggregate([
      { $unwind: "$products" },
      {$match: {
        'products.status': 'Delivered',
        $and: [
        { 'products.deleveryDate': { $gt: new Date(startDate)} },
        { 'products.deleveryDate': { $lt: new Date(endDate) } }
        ]
      }},
      { $sort: { date: -1 } },
      {
        $lookup: {
        from: 'products',
        let: { productId: { $toObjectId: '$products.productId' } },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$productId'] } } }
        ],
        as: 'products.productDetails'
        }
      },  
      {
        $addFields: {
        'products.productDetails': { $arrayElemAt: ['$products.productDetails', 0] }
        }
      }
      ]);

      const pages = parseInt(req.query.page) || 1;
      const limit = 20;
      const startIndex = (pages - 1) * limit;
      const endIndex = pages * limit;
      const orderCount = order.length;
      const totalPages = Math.ceil(orderCount / limit);
      const paginatedOrder = order.slice(startIndex, endIndex);
    
  
    res.render("saleReport", 
    { 
      order:paginatedOrder,
      admin:adminData,
      activePage: 'saleReport',
      order: paginatedOrder,
      currentPage: pages,
      totalPages: totalPages,
      startDate,
      endDate
    });

  }catch(err){
    next(err)
  }
}



//=========================== ADMIN SIDE SALES REPORT PDF DOWNLODING SECTION START ===========================//

const salesReportPdf = async (req,res,next) =>{
  try{
    const startDate = req.params.startDate;
    const endDate = req.params.endDate;
    const adminData = await User.findById(req.session.auser_id);
   

    if(parseInt(startDate) === 0){
      const order = await Order.aggregate([
        { $unwind: "$products" },
        {$match: {
          'products.status': 'Delivered',
        }},
        { $sort: { date: -1 } },
        {
          $lookup: {
          from: 'products',
          let: { productId: { $toObjectId: '$products.productId' } },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$productId'] } } }
          ],
          as: 'products.productDetails'
          }
        },  
        {
          $addFields: {
          'products.productDetails': { $arrayElemAt: ['$products.productDetails', 0] }
          }
        }
      ]);
  
      const pages = parseInt(req.query.page) || 1;
      const limit = 20;
      const startIndex = (pages - 1) * limit;
      const endIndex = pages * limit;
      const orderCount = order.length;
      const totalPages = Math.ceil(orderCount / limit);
      const paginatedOrder = order.slice(startIndex, endIndex);
    
      const data = {
        order,
      }
  
      const filepathName = path.resolve(__dirname, '../views/admin/slaeReportPdf.ejs');
      const html = fs.readFileSync(filepathName).toString();
      const ejsData = ejs.render(html, data);
      
      const browser = await puppeteer.launch({ headless: 'new',executablePath: '/usr/bin/chromium-browser'});
      const page = await browser.newPage();
      await page.setContent(ejsData, { waitUntil: 'networkidle0' });
      const pdfBytes = await page.pdf({ format: 'Letter' });
      await browser.close();
  
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename= order invoice.pdf');
      res.send(pdfBytes);

    }else{
      const order = await Order.aggregate([
        { $unwind: "$products" },
        {$match: {
          'products.status': 'Delivered',
          $and: [
            { 'products.deleveryDate': { $gt: new Date(startDate)} },
            { 'products.deleveryDate': { $lt: new Date(endDate) } }
            ]
        }},
        { $sort: { date: -1 } },
        {
          $lookup: {
          from: 'products',
          let: { productId: { $toObjectId: '$products.productId' } },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$productId'] } } }
          ],
          as: 'products.productDetails'
          }
        },  
        {
          $addFields: {
          'products.productDetails': { $arrayElemAt: ['$products.productDetails', 0] }
          }
        }
      ]);
  
      const pages = parseInt(req.query.page) || 1;
      const limit = 20;
      const startIndex = (pages - 1) * limit;
      const endIndex = pages * limit;
      const orderCount = order.length;
      const totalPages = Math.ceil(orderCount / limit);
      const paginatedOrder = order.slice(startIndex, endIndex);
    
      const data = {
        order,
      }
  
      const filepathName = path.resolve(__dirname, '../views/admin/slaeReportPdf.ejs');
      const html = fs.readFileSync(filepathName).toString();
      const ejsData = ejs.render(html, data);
      
      const browser = await puppeteer.launch({ headless: 'new',executablePath: '/usr/bin/chromium-browser'});
      const page = await browser.newPage();
      await page.setContent(ejsData, { waitUntil: 'networkidle0' });
      const pdfBytes = await page.pdf({ format: 'Letter' });
      await browser.close();
  
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename= order invoice.pdf');
      res.send(pdfBytes);

    }
  }catch(err){
    next(err)
  }
}



//=========================== ADMIN SIDE SALES REPORT EXEL DOWNLODING SECTION START ===========================//

const salesReportExel = async (req,res,next) =>{
  try{
    const startDate = req.params.startDate;
    const endDate = req.params.endDate;
    const adminData = await User.findById(req.session.auser_id);
   

    if(parseInt(startDate) === 0){
      const order = await Order.aggregate([
        { $unwind: "$products" },
        {$match: {
          'products.status': 'Delivered',
        }},
        { $sort: { date: -1 } },
        {
          $lookup: {
          from: 'products',
          let: { productId: { $toObjectId: '$products.productId' } },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$productId'] } } }
          ],
          as: 'products.productDetails'
          }
        },  
        {
          $addFields: {
          'products.productDetails': { $arrayElemAt: ['$products.productDetails', 0] }
          }
        }
      ]);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Sales Report");
      worksheet.columns = [
        { header: "No", key: "no", width: 5 },
        { header: "Product Name", key: "productName", width: 30 },
        { header: "User Name", key: "userName", width: 20 },
        { header: "Order Date", key: "orderDate", width: 15 },
        { header: "Payment Method", key: "paymentMethod", width: 15 },
        { header: "Quantity", key: "quantity", width: 10 },
        { header: "Total Amount", key: "totalAmount", width: 15 },
      ];
  
      order.forEach((o, i) => {
        worksheet.addRow({
          no: i + 1,
          productName: o.products.productDetails.productName,
          userName: o.userName,
          orderDate: o.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }).replace(/\//g, '-'),
          paymentMethod: o.paymentMethod,
          quantity: o.products.count,
          totalAmount: o.totalAmount,
        });
      });
  
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=sales_report.xlsx");
      await workbook.xlsx.write(res);
  
    }else{
      const order = await Order.aggregate([
        { $unwind: "$products" },
        {$match: {
          'products.status': 'Delivered',
          $and: [
            { 'products.deleveryDate': { $gt: new Date(startDate)} },
            { 'products.deleveryDate': { $lt: new Date(endDate) } }
            ]
        }},
        { $sort: { date: -1 } },
        {
          $lookup: {
          from: 'products',
          let: { productId: { $toObjectId: '$products.productId' } },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$productId'] } } }
          ],
          as: 'products.productDetails'
          }
        },  
        {
          $addFields: {
          'products.productDetails': { $arrayElemAt: ['$products.productDetails', 0] }
          }
        }
      ]);
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Sales Report");
      worksheet.columns = [
        { header: "No", key: "no", width: 5 },
        { header: "Product Name", key: "productName", width: 30 },
        { header: "User Name", key: "userName", width: 20 },
        { header: "Order Date", key: "orderDate", width: 15 },
        { header: "Payment Method", key: "paymentMethod", width: 15 },
        { header: "Quantity", key: "quantity", width: 10 },
        { header: "Total Amount", key: "totalAmount", width: 15 },
      ];
  
      order.forEach((o, i) => {
        worksheet.addRow({
          no: i + 1,
          productName: o.products.productDetails.productName,
          userName: o.userName,
          orderDate: o.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }).replace(/\//g, '-'),
          paymentMethod: o.paymentMethod,
          quantity: o.products.count,
          totalAmount: o.totalAmount,
        });
      });
  
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=sales_report.xlsx");
      await workbook.xlsx.write(res);
    }
  }catch(err){
    next(err)
  }
}



//=========================== ADMIN LOGOUT SECTION START ===========================//

const adminLogout = async (req,res,next)=>{
  try{
      req.session.destroy();
      res.redirect('/admin')
  }catch(err){
      next(err);
  }
}



//=========================== ADMIN USERLIST SHOWING SECTION START ===========================//

const loadUserList = async (req,res,next)=>{
  try{
    const adminData = await User.findById({ _id: req.session.auser_id})
    const userData = await User.find({is_admin:0})

    const page = parseInt(req.query.page) || 1; 
    const limit = 20; 
    const startIndex = (page - 1) * limit; 
    const endIndex = page * limit; 
    const userCount = userData.length;
    const totalPages = Math.ceil(userCount / limit); 
    const paginatedCategory = userData.slice(startIndex, endIndex);

    res.render('userList',
    {
      admin:adminData,
      useres:userData,
      activePage: 'userList',
      useres: paginatedCategory, 
      currentPage: page,
      totalPages: totalPages,
    });
  }catch(err){
      next(err);
  }
}



//=========================== ADMIN USER BLOCKING SECTION START ===========================//

const block = async (req,res,next)=>{
  try{
      const userData = await User.findByIdAndUpdate(req.query.id,{$set:{is_block:true}});
      req.session.useres = null
      res.redirect('/admin/userList')
  }catch(err){
      next(err);
  }
}



//=========================== ADMIN USER UNBLOCKING SECTION START ===========================//

const unblock = async (req,res,next)=>{
  try{
      const userData = await User.findByIdAndUpdate(req.query.id,{$set:{is_block:false}});
      res.redirect('/admin/userList')
  }catch(err){
      next(err);
  }
}



module.exports = {
  loadLogin,
  verifyLogin,
  loadDashbord,
  loadSalesReport,
  salesReportSort,
  salesReportPdf,
  salesReportExel,
  adminLogout,
  loadUserList,
  block,
  unblock,
}