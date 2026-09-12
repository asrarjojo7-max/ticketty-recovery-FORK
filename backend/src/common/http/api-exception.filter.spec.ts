import { ArgumentsHost, ForbiddenException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiExceptionFilter, errorCodeForStatus } from './api-exception.filter';

describe('errorCodeForStatus', () => {
  it.each([
    [HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR'],
    [HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED'],
    [HttpStatus.FORBIDDEN, 'FORBIDDEN'],
    [HttpStatus.NOT_FOUND, 'NOT_FOUND'],
    [HttpStatus.CONFLICT, 'CONFLICT'],
    [HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED'],
    [HttpStatus.I_AM_A_TEAPOT, 'REQUEST_FAILED'],
    [HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR'],
  ] as const)('maps status %s to %s', (status, code) => {
    expect(errorCodeForStatus(status)).toBe(code);
  });
});

describe('ApiExceptionFilter', () => {
  it('preserves the mandatory password-change machine code', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          requestId: 'request-2',
          headers: {},
          method: 'GET',
          path: '/api/trips',
        }),
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;

    new ApiExceptionFilter().catch(
      new ForbiddenException({
        message: 'يجب تغيير كلمة المرور المؤقتة قبل المتابعة',
        errorCode: 'PASSWORD_CHANGE_REQUIRED',
      }),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      statusCode: 403,
      code: 'PASSWORD_CHANGE_REQUIRED',
      message: 'يجب تغيير كلمة المرور المؤقتة قبل المتابعة',
      requestId: 'request-2',
    });
  });

  it('maps a Prisma unique conflict without exposing database details', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          requestId: 'request-1',
          headers: {},
          method: 'POST',
          path: '/api/bookings',
        }),
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;
    const exception = new Prisma.PrismaClientKnownRequestError(
      'sensitive database detail',
      { code: 'P2002', clientVersion: '6.19.3' },
    );

    new ApiExceptionFilter().catch(exception, host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      statusCode: 409,
      code: 'DUPLICATE_OPERATION',
      message: 'A record with the same unique value already exists',
      requestId: 'request-1',
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain(
      'sensitive database detail',
    );
  });
});
