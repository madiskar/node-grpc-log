import winston from 'winston';
import grpc from 'grpc';
import * as jspb from 'google-protobuf';
import { GenericServiceCall, GenericCallHandler, NextFunction } from '@mdkr/grpc-chain';

interface CallInfo {
  message: string;
  req_id?: number;
  path: string;
  call_type: 'unary' | 'client_stream' | 'server_stream' | 'bidi_stream';
}

interface StartMsg extends CallInfo {
  metadata?: grpc.Metadata;
  payload?: { [key: string]: unknown };
}

interface FinishMsg extends CallInfo {
  took_ms: number;
  code?: grpc.status;
  payload?: { [key: string]: unknown };
}

interface StreamMsg extends CallInfo {
  payload?: { [key: string]: unknown };
}

export interface CallLogConfiguration {
  omitRequestMetadata?: boolean;
  omitUnaryRequestPayload?: boolean;
  omitUnaryResponsePayload?: boolean;
  omitStreamOutMsgPayload?: boolean;
  omitStreamInMsgPayload?: boolean;
  omitUnaryRequestPayloadKeys?: string[];
  omitUnaryResponsePayloadKeys?: string[];
  omitStreamOutMsgPayloadKeys?: string[];
  omitStreamInMsgPayloadKeys?: string[];
}

export interface LoggingOptions {
  logger: winston.Logger;
  logConfigurations: { [path: string]: CallLogConfiguration };
}

const defaultLogFormat = winston.format.combine(winston.format.timestamp(), winston.format.json());

const defaultLogger = winston.createLogger({
  format: defaultLogFormat,
  level: 'debug',
  transports: [new winston.transports.Console()],
});

const defaultOptions: LoggingOptions = {
  logger: defaultLogger,
  logConfigurations: {},
};

export { defaultLogFormat, defaultLogger, defaultOptions };

export default function (opts = defaultOptions): GenericCallHandler {
  return (call: GenericServiceCall, next: NextFunction) => {
    const logger = opts.logger;

    // try {
    //   const startTime = Date.now();

    //   const startMsg: StartMsg = {
    //     message: 'Start handling call',
    //     path: call.ctx.method.path,
    //   };
    //   if (!minimal) {
    //     startMsg.metadata = call.metadata;

    //     if (!ctx.method.requestStream) {
    //       startMsg.payload = (((call as grpc.ServerUnaryCall<T> | grpc.ServerWritableStream<T>)
    //         .request as unknown) as jspb.Message).toObject();
    //     }
    //   }

    //   logger.info(startMsg);

    //   if (ctx.method.requestStream) {
    //     call.on('data', (msg) => {
    //       const streamRecvMsg: StreamRecvMsg = {
    //         message: 'Received message from peer via stream',
    //         requestId: ctx.reqId,
    //         path: ctx.method.path,
    //       };
    //       if (!minimal && msg) {
    //         streamRecvMsg.payload = msg.toObject();
    //       }
    //       logger.info(streamRecvMsg);
    //     });
    //   }

    //   ctx.onStreamMsgOut((pbMsg) => {
    //     const msg: StreamSendMsg = {
    //       message: 'Sent message to peer via stream',
    //       requestId: ctx.reqId || '',
    //       path: ctx.method.path || '',
    //     };
    //     if (!minimal) {
    //       msg.payload = pbMsg.toObject();
    //     }
    //     logger.info(msg);
    //   });

    //   ctx.onCallFinish(() => {
    //     const finishMsg: FinishMsg = {
    //       message: 'Call handling finished',
    //       requestId: ctx.reqId,
    //       path: ctx.method.path,
    //       code: ctx.respCode,
    //       duration: Date.now() - startTime + 'ms',
    //     };
    //     if (!minimal && ctx.respPayload) {
    //       finishMsg.payload = ctx.respPayload.toObject();
    //     }
    //     logger.info(finishMsg);
    //   });
    // } catch (err) {
    //   logger.error('Call logging failed');
    //   logger.error(err.toString());
    // }

    next();
  };
}
