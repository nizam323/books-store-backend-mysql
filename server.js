const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const mysql = require('mysql2');
const cors = require('cors');
const authenticateToken = require('./authMiddleware');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// const db = mysql.createConnection({
//   host: process.env.host,
//   user: process.env.user,
//   password: process.env.password,
//   database: process.env.database,
//   port:process.env.databasePort
// });

const db = mysql.createPool({
  host: process.env.host,
  user: process.env.user,
  password: process.env.password,
  database: process.env.database,
  port: process.env.databasePort,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// db.connect((err) => {
//   if (err) {
//     console.error('Error connecting to the database:', err);
//     return;
//   }
//   console.log('Connected to the database.');
// });

// SignUp Route
app.post('/signup', async (req, res) => {
  const { isAdmin, username, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    let sql;

    if (isAdmin) {
      sql = 'INSERT INTO admins (username, email, password) VALUES (?, ? ,?)';
    } else {
      sql = 'INSERT INTO users (username, email, password) VALUES (?, ? ,?)';
    }
    db.query(sql, [username, email, hashedPassword], (err, results) => {
      if (err) {
        return res.status(400).json({ message: 'User already exists or an error occurred', error: err.message });
      }
      console.log(results);
      res.status(201).json({ message: 'User signedup successfully' });
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// signIn Route
app.post('/signin', (req, res) => {
  const { isAdmin, email, password } = req.body;
  let sql;
  if (isAdmin) {
    sql = 'SELECT * FROM admins WHERE email = ?';
  } else {
    sql = 'SELECT * FROM users WHERE email = ?';
  }
  db.query(sql, [email], async (err, results) => {
    if (err) return res.status(500).json({ message: 'Server error', error: err.message });
    if (results.length === 0) return res.status(401).json({ message: 'Invalid credentials' });

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const payload = { userId: user.id, userName: user.username, userEmail: user.email };
    const token = jwt.sign(payload, process.env.JWT_SECRET_KEY, { expiresIn: '1h' });

    res.json({ token });
  });
});

// Protected Route
app.get('/checkauth', authenticateToken, (req, res) => {
  // res.json({ user: req.user });
});

// user profile name
app.post('/profile', (req, res) => {
  const { userEmail } = req.body;
  const sql = 'SELECT username FROM users WHERE email = ?';
  db.query(sql, [userEmail], (err, results) => {
    if (err) return res.status(500).json({ message: 'Server error', error: err.message });
    if (results.length === 0) return res.status(404).json({ message: 'User not found' });
    res.json(results[0]);
  });
});

// for main public website
//get products
app.get("/get-products", (req, res) => {
  const sql = "select * from products";
  db.query(sql, (error, results) => {
    if (error) {
      console.log("error", error);
      return res.status(500).json({ message: 'Server error', error: error.message });
    }
    if (results.length === 0) {
      console.log("results", results);
      return res.status(404).json({ message: 'some error occured while getting products' });
    }
    res.json(results);
  })
});

// for product detail page
//get products
app.get("/get-product/:id", (req, res) => {
  const { id } = req.params;
  const sql = "SELECT * FROM products WHERE id = ?";
  db.query(sql, [id], (error, results) => {
    if (error) {
      console.error("Error fetching product:", error);
      return res.status(500).json({ message: "Server error", error: error.message });
    }
    if (results.length === 0) {
      return res.status(404).json({ message: "Product not found." });
    }
    res.json(results[0]);
  });
});

// Admin panel

//get products
app.put("/get", (req, res) => {
  const { userEmail } = req.body;
  const sql = "select * from products where ownerEmail = ?";
  db.query(sql, [userEmail], (error, results) => {
    if (error) {
      console.log("error", error);
      return res.status(500).json({ message: 'Server error', error: error.message });
    }
    if (results.length === 0) {
      console.log("results", results);
      return res.status(404).json({ message: 'some error occured while getting products' });
    }
    res.json(results);
  })
});

//add product
app.post("/add", (req, res) => {
  const { proName, proPrice, proURL, ownerEmail } = req.body;
  if (proName && proPrice && proURL && ownerEmail) {
    const sql = "insert into products (productname, productprice, productpicurl, ownerEmail) values (?,?,?,?)";
    db.query(sql, [proName, proPrice, proURL, ownerEmail], (error, results) => {
      if (error) return res.status(500).json({ message: 'Server error', error: error.message });
      const insertedId = results.insertId;
      const fetchSql = "SELECT * FROM products WHERE id = ?";
      db.query(fetchSql, [insertedId], (err, productResults) => {
        if (err) {
          return res.status(500).json({ message: "Server error", error: err.message });
        }
        if (productResults.length === 0) {
          return res.status(404).json({ message: "Product not found after insert" });
        }
        res.json({ product: productResults[0] });
      });
    })
  } else {
    res.status(401).json({ msg: "Fill All Inputs" })
  }
});

//update product
app.put("/update", (req, res) => {
  const { proId, proName, proPrice, proURL, ownerEmail } = req.body;
  if (!proId) {
    return res.status(400).json({ msg: "Product ID is required" });
  }
  let sql = "UPDATE products SET ";
  const updates = [];
  const values = [];

  if (proName) {
    updates.push("productname = ?");
    values.push(proName);
  }
  if (proPrice) {
    updates.push("productprice = ?");
    values.push(proPrice);
  }
  if (proURL) {
    updates.push("productpicurl = ?");
    values.push(proURL);
  }
  if (updates.length == 0) {
    return res.status(400).json({ msg: "No fields to update" });
  }

  sql += updates.join(", ") + " WHERE id = ? AND ownerEmail = ?";
  values.push(proId);
  values.push(ownerEmail);

  db.query(sql, values, (error, results) => {
    if (error) {
      return res.status(500).json({ message: "Server error", error: error.message });
    }
    if (results.affectedRows == 0) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json({ msg: "Product updated successfully" });
  });
});

//delete product
app.delete("/delete", (req, res) => {
  const { proId, ownerEmail } = req.body;
  if (proId) {
    const sql = "delete from products where id = ? AND ownerEmail = ?";
    db.query(sql, [proId, ownerEmail], (error, results) => {
      if (error) return res.status(500).json({ message: 'Server error', error: error.message });
      if (results.affectedRows == 0) return res.status(404).json({ message: 'some error occured while deleting product' });
      res.json({ msg: "Product deleted" })
    })
  } else {
    res.json({ msg: "fill id input" })
  }
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
