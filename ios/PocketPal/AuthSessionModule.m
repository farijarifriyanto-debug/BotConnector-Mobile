//
//  AuthSessionModule.m
//  PocketPal
//
//  Objective-C bridge for AuthSessionModule
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AuthSessionModule, NSObject)

RCT_EXTERN_METHOD(openAuth:(NSString *)url
                  callbackScheme:(NSString *)scheme
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

@interface RCT_EXTERN_MODULE(SpeechRecognitionModule, NSObject)

RCT_EXTERN_METHOD(recognizeOnce:(NSString *)locale
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(cancel)

@end
