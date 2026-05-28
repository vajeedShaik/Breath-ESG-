# Breathe ESG – Emissions Data Ingestion Platform

This project is a prototype ESG data ingestion platform built using Django and React. The goal of the system is to help sustainability analysts upload, review, normalise, and approve emissions-related data before it is shared with auditors or reporting teams.

The platform supports three enterprise data sources:

* SAP fuel and procurement exports
* Utility electricity reports
* Corporate travel records

The system processes uploaded files, converts the values into standardised emissions records, flags suspicious entries, and stores a complete audit trail of all analyst actions.

---

# Tech Stack

## Backend

* Django
* Django REST Framework
* SQLite (development database)
* JWT Authentication

## Frontend

* React
* Vite
* Axios
* Recharts

---

# Project Structure

```text
breathe-esg/
│
├── backend/
│   ├── breathe_esg/
│   ├── ingestion/
│   ├── accounts/
│   ├── manage.py
│   └── seed_data.py
│
├── frontend/
│   └── src/
│       ├── pages/
│       ├── components/
│       └── hooks/
│
├── sample_data/
│
└── docs/
```

---

# Features Implemented

## 1. Authentication System

The platform includes login authentication using JWT tokens. Demo users are created through the seed script.

Example credentials:

* analyst / demo1234
* admin / demo1234

---

## 2. File Upload and Parsing

Users can upload files from different enterprise systems. Each source type has its own parser.

Supported formats include:

* CSV files
* JSON exports

The parser extracts:

* activity date
* quantity
* units
* emission values
* source category
* scope classification

---

## 3. Data Normalisation

Raw uploaded values are preserved while additional normalised fields are generated for consistent reporting.

Examples:

* gallons → litres
* MWh → kWh

This makes the data easier to compare and aggregate later.

---

# 4. Review Workflow

Uploaded records appear in a review queue where analysts can:

* approve records
* reject records
* edit incorrect values
* add review notes

Records can also be flagged automatically if suspicious values are detected.

Examples:

* unusually high electricity usage
* unknown plant codes
* missing travel origin data

---

# 5. Dashboard

The dashboard displays summary statistics including:

* total emissions
* records imported
* emissions by scope
* chart visualisations

Charts are implemented using Recharts.

---

# 6. Audit Logging

Every important action is recorded in an audit log, including:

* approvals
* edits
* rejections
* batch locking

This helps maintain traceability for compliance and auditing purposes.



# Running the Project

## Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python seed_data.py
python manage.py runserver
```

Backend runs on:

```text
http://localhost:8000
```

---

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on:

```text
http://localhost:5173
```

---

# Sample Data

The project includes sample files for testing different ingestion flows:

* SAP fuel sample
* Utility electricity sample
* Corporate travel sample

These files contain realistic edge cases such as:

* missing values
* unit conversion issues
* unknown plant identifiers
* long-haul and short-haul travel records

---

# Design Decisions

Some important implementation decisions made during development:

* Raw uploaded values are preserved instead of overwritten
* Flags are stored in structured JSON format
* Audit records are append-only
* Parsing logic is separated from database operations
* Batch approval is handled independently from record status

---

# Future Improvements

Some features that can be added later:

* automated emission factor updates
* role-based permissions
* inline bulk editing
* advanced analytics dashboards
* export to external ESG reporting systems

---

# Conclusion

This project demonstrates a complete full-stack workflow for ESG emissions data ingestion and review. The system focuses on usability, auditability, and realistic enterprise data handling while keeping the architecture modular and easy to extend.
