import winston from 'winston';
import grpc from 'grpc';
import {
  GenericServiceCall,
  GenericCallHandler,
  NextFunction,
  ChainServerUnaryCall,
  ChainServerWritableStream,
  ChainServerReadableStream,
  ChainServerDuplexStream,
} from '@mdkr/grpc-chain';
import * as jspb from 'google-protobuf';

interface CallInfo {
  message: string;
  req_id?: string;
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

interface StreamDataMsg extends CallInfo {
  payload?: { [key: string]: unknown };
}

type StreamMsg = CallInfo;

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
  logger: winston.Logger<winston.DefaulLevels>;
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

function omitProperty(obj: { [key: string]: unknown }, prop: string): void {
  for (const key in obj) {
    if (key === prop) {
      obj[prop] = '<redacted>';
    } else if (typeof obj[prop] === 'object') {
      omitProperty(obj[prop] as { [key: string]: unknown }, prop);
    }
  }
}

export { defaultLogFormat, defaultLogger, defaultOptions };

export default function (opts = defaultOptions): GenericCallHandler {
  return (call: GenericServiceCall, next: NextFunction) => {
    const logger = opts.logger;
    const logConf: CallLogConfiguration | undefined = opts.logConfigurations[call.ctx.method.path];

    const startTime = Date.now();

    // Collect basic call info
    const callInfo: CallInfo = {
      path: call.ctx.method.path,
      call_type: 'unary',
      message: '',
    };

    // If the 'req-id' middleware is used, attach the generated
    // id to our log message
    if (call.ctx.locals.reqId) {
      callInfo.req_id = call.ctx.locals.reqId as string;
    }

    if (call.ctx.method.requestStream && call.ctx.method.responseStream) {
      callInfo.call_type = 'bidi_stream';
    } else if (call.ctx.method.requestStream) {
      callInfo.call_type = 'client_stream';
    } else if (call.ctx.method.responseStream) {
      callInfo.call_type = 'server_stream';
    }

    const startMsg: StartMsg = {
      ...callInfo,
      message: 'Start call handling',
    };

    if (!logConf || !logConf.omitRequestMetadata) {
      startMsg.metadata = call.core.metadata;
    }

    if (!call.ctx.method.requestStream) {
      call = call as
        | ChainServerUnaryCall<jspb.Message, jspb.Message>
        | ChainServerWritableStream<jspb.Message, jspb.Message>;

      if (!logConf || !logConf.omitUnaryRequestPayload) {
        const payload = call.req.toObject();
        if (logConf && logConf.omitUnaryRequestPayloadKeys) {
          for (const prop of logConf.omitUnaryRequestPayloadKeys) {
            omitProperty(payload, prop);
          }
        }
        startMsg.payload = payload;
      }
    }

    if (!call.ctx.method.responseStream) {
      call = call as
        | ChainServerReadableStream<jspb.Message, jspb.Message>
        | ChainServerUnaryCall<jspb.Message, jspb.Message>;

      call.onUnaryDataSent((payloadPb) => {
        const finishMsg: FinishMsg = {
          ...callInfo,
          message: 'Call handling finished',
          took_ms: startTime - Date.now(),
        };

        if (!logConf || !logConf.omitUnaryResponsePayload) {
          const payload = payloadPb.toObject();
          if (logConf && logConf.omitUnaryResponsePayloadKeys) {
            for (const prop of logConf.omitUnaryResponsePayloadKeys) {
              omitProperty(payload, prop);
            }
          }
          finishMsg.payload = payload;
        }

        logger.info(finishMsg);
      });
    }

    if (call.ctx.method.requestStream) {
      call = call as
        | ChainServerReadableStream<jspb.Message, jspb.Message>
        | ChainServerDuplexStream<jspb.Message, jspb.Message>;

      call.onInStreamEnded(() => {
        const msg: StreamMsg = {
          ...callInfo,
          message: 'Inbound stream has ended',
        };
        logger.info(msg);
      });

      call.onMsgIn((payloadPb, nextGate) => {
        nextGate();

        const streamMsg: StreamDataMsg = {
          ...callInfo,
          message: 'Received data from peer via stream',
        };

        if (!logConf || !logConf.omitStreamInMsgPayload) {
          const payload = payloadPb.toObject();
          if (logConf && logConf.omitStreamInMsgPayloadKeys) {
            for (const prop of logConf.omitStreamInMsgPayloadKeys) {
              omitProperty(payload, prop);
            }
          }
          streamMsg.payload = payload;
        }

        logger.info(streamMsg);
      });
    }

    if (call.ctx.method.responseStream) {
      call = call as
        | ChainServerWritableStream<jspb.Message, jspb.Message>
        | ChainServerDuplexStream<jspb.Message, jspb.Message>;

      call.onOutStreamEnded(() => {
        const msg: StreamMsg = {
          ...callInfo,
          message: 'Outbound stream has ended',
        };
        logger.info(msg);
      });

      call.onMsgOut((payloadPb, nextGate) => {
        nextGate();

        const streamMsg: StreamDataMsg = {
          ...callInfo,
          message: 'Sending data to peer via stream',
        };

        if (!logConf || !logConf.omitStreamOutMsgPayload) {
          const payload = payloadPb.toObject();
          if (logConf && logConf.omitStreamOutMsgPayloadKeys) {
            for (const prop of logConf.omitStreamOutMsgPayloadKeys) {
              omitProperty(payload, prop);
            }
          }
          streamMsg.payload = payload;
        }

        logger.info(streamMsg);
      });
    }

    logger.info(startMsg);

    next();
  };
}
