const allowedStatuses = ["pending", "published", "rejected"]; // add draft if needed

const status = (req.body.status ?? "pending").toString().trim().toLowerCase();

if (!allowedStatuses.includes(status)) {
  missingFields.push("status"); // or return invalid-status error
} else {
  req.body.status = status;
}

const payload = { ...req.body };
payload.status = (payload.status || "pending").toLowerCase().trim();
// DO NOT force payload.status = "published"