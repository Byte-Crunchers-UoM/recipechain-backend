approval_status: {
  type: String,
  enum: ["pending", "published", "rejected", "draft"],
  required: true,
  default: "pending",
},