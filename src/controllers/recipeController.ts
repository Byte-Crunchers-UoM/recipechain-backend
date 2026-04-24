const allowedStatuses = ["pending", "published", "rejected"]; // add draft if needed

const status = (req.body.status ?? "pending").toString().trim().toLowerCase();

if (!allowedStatuses.includes(status)) {
  missingFields.push("status");
} else {
  req.body.status = status;
}