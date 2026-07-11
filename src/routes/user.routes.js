// backend/src/routes/user.routes.js
import { Router } from "express";
import { getUsers, createUser, updateUser, deleteUser } from "../controllers/user.controller.js";
import { protect, admin } from "../middleware/auth.middleware.js";

const router = Router();

router.route("/users")
  .get(protect, admin, getUsers)
  .post(protect, admin, createUser);

router.route("/users/:id")
  .put(protect, admin, updateUser)
  .delete(protect, admin, deleteUser);

export default router;
