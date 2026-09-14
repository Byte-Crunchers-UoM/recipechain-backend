/**
 * Sanitizes and calculates database offset ranges.
 * Enforces a maximum limit to prevent database overload attacks.
 */
export const getPaginationOptions = (pageQuery, limitQuery, defaultLimit = 10, maxLimit = 100) => {
    // 1. Ensure strictly positive integers
    const page = Math.max(1, parseInt(pageQuery, 10) || 1);
    let limit = Math.max(1, parseInt(limitQuery, 10) || defaultLimit);
    
    // 2. Security: Cap the maximum limit
    limit = Math.min(limit, maxLimit);

    // 3. Calculate Supabase range indices (inclusive)
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    return { page, limit, from, to };
};

/**
 * Generates standardized pagination metadata for the API response.
 */
export const getPaginationMeta = (totalItems, page, limit) => {
    const totalPages = Math.ceil(totalItems / limit);
    
    return {
        totalItems,
        totalPages,
        currentPage: page,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
    };
};