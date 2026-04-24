status: {
  type: String,
  enum: ["pending", "published", "rejected"],
  required: true,
  default: "pending",
},