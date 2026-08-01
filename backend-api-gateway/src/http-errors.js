const { ZodError } = require('zod');

class AppError extends Error {
    constructor(status, title, detail, options = {}) {
        super(detail);
        this.name = 'AppError';
        this.status = status;
        this.title = title;
        this.type = options.type || 'about:blank';
        this.errors = options.errors;
    }
}

function validate(schema) {
    return (request, _response, next) => {
        try {
            const parsed = schema.parse({
                body: request.body,
                params: request.params,
                query: request.query
            });
            request.validated = parsed;
            next();
        } catch (error) {
            next(error);
        }
    };
}

function notFound(request, _response, next) {
    next(new AppError(404, 'Not Found', `No route exists for ${request.method} ${request.path}.`));
}

function fabricStatus(message) {
    if (message.includes('already exists') || message.includes('already been reviewed')) return 409;
    if (message.includes('does not exist')) return 404;
    if (
        message.includes('required')
        || message.includes('invalid')
        || message.includes('must be')
        || message.includes('not an authorized')
    ) return 400;
    return 500;
}

function errorHandler(error, request, response, _next) {
    let status = error.status || 500;
    let title = error.title || 'Internal Server Error';
    let detail = error.message || 'An unexpected error occurred.';
    let errors = error.errors;

    if (error instanceof ZodError) {
        status = 422;
        title = 'Validation Failed';
        detail = 'One or more request fields are invalid.';
        errors = error.issues.map((issue) => ({
            field: issue.path.slice(1).join('.'),
            message: issue.message
        }));
    } else if (!(error instanceof AppError)) {
        detail = error.details?.[0]?.message || detail;
        status = fabricStatus(detail);
        title = status === 409 ? 'Conflict'
            : status === 404 ? 'Not Found'
                : status < 500 ? 'Bad Request'
                    : 'Internal Server Error';
    }

    const log = status >= 500 ? request.log?.error.bind(request.log) : request.log?.warn.bind(request.log);
    log?.({ err: error, status }, detail);
    response
        .status(status)
        .type('application/problem+json')
        .json({
            type: error.type || 'about:blank',
            title,
            status,
            detail,
            instance: request.originalUrl,
            traceId: request.id,
            ...(errors ? { errors } : {})
        });
}

module.exports = { AppError, errorHandler, notFound, validate };
