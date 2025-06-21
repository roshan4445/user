const express = require('express');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(cors());

let dbUser = null;
let dbAdmin = null;
let dbcomplaint = null;
let dbdateofcomplaint = null;
let dbtraffic = null;
let dbsheamas = null;
const initializeDBs = async () => {
  try {
    dbUser = await open({
      filename: path.join(__dirname, 'people_data.db'),
      driver: sqlite3.Database,
    });

    dbAdmin = await open({
      filename: path.join(__dirname, 'dummy_admins.db'),
      driver: sqlite3.Database,
    });
    dbcomplaint = await open({
      filename: path.join(__dirname, 'complaint_form.db'),
      driver: sqlite3.Database,
    });
    dbdateofcomplaint = await open({
      filename: path.join(__dirname, 'complaint_date.db'),
      driver: sqlite3.Database,
    });
    dbtraffic = await open({
      filename: path.join(__dirname, 'traffic_complaint_form.db'),
      driver: sqlite3.Database,
    });
    dbsheamas = await open({
      filename: path.join(__dirname, '30-new-schemes.db'),
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('✅ Server running at http://localhost:3000');
    });
  } catch (e) {
    console.error('❌ DB Error:', e.message);
    process.exit(1);
  }
};

initializeDBs();

// People login
let aadhar_no_storing = null;
app.post('/auth_user', async (request, response) => {
  try {
    const { aadharNo, password } = request.body;

    const person = await dbUser.get('SELECT * FROM people WHERE aadhaarNo = ?', [aadharNo]);
    aadhar_no_storing = person.aadhaarNo;

    if (person && password === person.aadhaarNo.slice(8, 12)) {
      const token = jwt.sign({ aadharNo }, 'MY_SECRET');
      response.send({ succeeded: true, jwtToken: token });
      
    } else {
      response.send({ succeeded: false, error: 'Invalid user credentials' });
    } 
  } catch (error) {
    console.error('/auth_user error:', error.message);
    response.status(500).send({ succeeded: false, error: 'Internal Server Error' });
  }

 
});

// Admin login
var admin_location = null;
app.post('/auth_admin', async (request, response) => {
  try {
    const { email, password } = request.body;

    const admin = await dbAdmin.get('SELECT * FROM admins WHERE Email = ?', [email]);
    admin_location = admin.Location;
    console.log("Admin request received:", request.body);
    if (password === admin.Password) {
      const token = jwt.sign({ email }, 'MY_SECRET');
      response.send({ succeeded: true, jwtToken: token });
    } else {
      console.log("Invalid admin credentials:", password, admin.Password);
      response.send({ succeeded: false, error: 'Invalid admin credentials' });
    }
  } catch (error) {
    console.error('/auth_admin error:', error.message);
    response.status(500).send({ succeeded: false, error: 'Internal Server Error' });
  }
});

// Create a new complaint by user
const today = new Date();

const options = { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' };
const formattedDate = today.toLocaleDateString('en-GB', options);

console.log(formattedDate);
const formattingdate = formattedDate.split(" ");
console.log(formattedDate.split(" ")); // e.g., "Friday, 20 June 2025"
const date_now = formattingdate[1];
const month_now = formattingdate[2];
const year_now = formattingdate[3];

app.post('/complaint_user', async (req, res) => {
  try {
    const {
      Full_Name,
      Contact_Number,
      Email_Address,
      Category,
      Address,
      Complaint_Title,
      Incident_Location,
      Detailed_Description
    } = req.body;

    const createComplaintQuery = `
      INSERT INTO complaint_form (
        Full_Name,
        Contact_Number,
        Email_Address,
        Category,
        Address,
        Complaint_Title,
        Incident_Location,
        Detailed_Description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const k = await dbcomplaint.run(createComplaintQuery, [
      Full_Name,
      Contact_Number,
      Email_Address,
      Category,
      Address,
      Complaint_Title,
      Incident_Location,
      Detailed_Description,
    ]);
    const SectorID = k.Incident_Location;
    const createDateQuery = `
      INSERT INTO complaint_date (date, month, year, SectorID) VALUES (?, ?, ?, ?)
    `;
    await dbdateofcomplaint.run(createDateQuery, [formattedDate, month_now, year_now, SectorID]);
    res.send({ succeeded: true });
  } catch (e) {
    console.error("/complaint_user error:", e);
    res.status(500).send({ succeeded: false, error: "Internal Server Error" });
  }
});


// get all complaints
app.get('/get_complaints', async (request, response) => {
  try {
    const complaints = await dbcomplaint.all('SELECT * FROM complaint_form');
    response.send({ succeeded: true, complaints });
  } catch (error) {
    console.error("/get_complaints error:", error.message);
    response.status(500).send({ succeeded: false, error: "Internal Server Error" });
  }
});


// Get complaints by Aadhaar number 

app.get('/get_complaints_by_aadhar', async (request, response) => {
  try {
    const aadhaarNo = aadhar_no_storing;

    if (!aadhaarNo) {
      return response.status(400).send({ succeeded: false, error: 'Aadhaar number is required' });
    }

    const complaints = await dbcomplaint.all('SELECT * FROM complaint_form WHERE aadhaarNo = ?', [aadhaarNo]);
    response.send({ succeeded: true, complaints });
  } catch (error) {
    console.error("/get_complaints_by_aadhar error:", error.message);
    response.status(500).send({ succeeded: false, error: "Internal Server Error" });
  }
});





// specific complaints for admin

app.get('/get_complaints_by_admin', async (request, response) => {
  try {
    const complaints = await dbcomplaint.all('SELECT * FROM complaint_form where status = "pending" and Location = ?', [admin_location]);
    response.send({ succeeded: true, complaints });
  } catch (error) {
    console.error("/get_complaints_by_admin error:", error.message);
    response.status(500).send({ succeeded: false, error: "Internal Server Error" });
  }
});



// Update complaint status by admin


app.put('/update_complaint_status', async (request, response) => {
  try {
    const { complaintId, status } = request.body;

    if (!complaintId || !status) {
      return response.status(400).send({ succeeded: false, error: 'Complaint ID and status are required' });
    }

    const updateStatusQuery = 'UPDATE complaint_form SET status = ? WHERE id = ?';
    await dbcomplaint.run(updateStatusQuery, [status, complaintId]);

    response.send({ succeeded: true, message: "Complaint status updated successfully" });
  } catch (error) {
    console.error("/update_complaint_status error:", error.message);
    response.status(500).send({ succeeded: false, error: "Internal Server Error" });
  }
});

// Get all complaints for admin
app.get('/get_all_complaints', async (request, response) => {
  try {
    const complaints = await dbcomplaint.all('SELECT * FROM complaint_form where Location = ?', [admin_location]);
    response.send({ succeeded: true, complaints });
  } catch (error) {
    console.error("/get_all_complaints error:", error.message);
    response.status(500).send({ succeeded: false, error: "Internal Server Error" });
  }
});


// traffic data from user 

app.post('/traffic_report', async (req, res) => {
  try {
    const { Issue_Type , Location , Description , Your_Name, Phone_Number } = req.body;
    console.log("Traffic report request received:", req.body);
    const createTrafficQuery = `
      INSERT INTO traffic_complaints (Issue_Type, Location, Description, Your_Name, Phone_Number) VALUES (?, ?, ?, ?, ?);
    `;

    await dbtraffic.run(createTrafficQuery, [Issue_Type, Location, Description, Your_Name, Phone_Number]);
    res.send({ succeeded: true });
  } catch (e) {
    console.error("/traffic_report error:", e);
    res.status(500).send({ succeeded: false, error: "Internal Server Error" });
  }
});


// Get all traffic complaints
app.get('/get_traffic_complaints', async (request, response) => {
  try {
    const trafficComplaints = await dbtraffic.all('SELECT * FROM traffic_complaints WHERE Location = ?', [admin_location]);
    response.send({ succeeded: true, trafficComplaints });
  } catch (error) {
    console.error("/get_traffic_complaints error:", error.message);
    response.status(500).send({ succeeded: false, error: "Internal Server Error" });
  }
});

app.get('/get_sheamas', async (request, response) => {
  console.log("Calling this function")
  try {
    const sheamas = await dbsheamas.all('SELECT * FROM grants');
    response.send({ succeeded: true, sheamas });
  } catch (error) {
    console.error("/get_sheamas error:", error.message);
    response.status(500).send({ succeeded: false, error: "Internal Server Error" });
  }
});