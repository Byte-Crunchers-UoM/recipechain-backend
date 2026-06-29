import { Request, Response, NextFunction } from 'express';
import recipeService from '../services/recipeService'; 

export const addRecipe = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const missingFields: string[] = [];
        const allowedStatuses = ["pending", "published", "rejected", "draft"];

        // 1. Approval Status validation logic
        const approvalStatus = (req.body.approval_status ?? "pending").toString().trim().toLowerCase();

        if (!allowedStatuses.includes(approvalStatus)) {
            missingFields.push("approval_status");
        } else {
            req.body.approval_status = approvalStatus;
        }

        const { title, ingredients, instructions, chef_id } = req.body;
        if (!title) missingFields.push("title");
        if (!ingredients) missingFields.push("ingredients");
        if (!instructions) missingFields.push("instructions");

        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Missing or invalid fields",
                missingFields
            });
        }

        const imageUrl = req.body.image_url || (req.file ? (req.file as any).path : null);

        const { tags, category, ...otherData } = req.body;
        // 2. recipeData object
        const recipeData = {
            ...otherData, 
            image_url: imageUrl,
            chef_id: chef_id || (req as any).user?.id, 
            approval_status: req.body.approval_status, 
            status: req.body.status,
            tags                   
        };

        const result = await recipeService.addRecipe(recipeData);

        return res.status(201).json({
            success: true,
            message: 'Recipe saved successfully',
            recipe: result.recipe,
            tag: result.tag || null
        });

    } catch (error) {
        next(error);
    }
};