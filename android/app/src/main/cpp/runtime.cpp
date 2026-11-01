#include <jni.h>
#include <algorithm>
#include <cstdlib>
#include <string>
#include <vector>
#include "node.h"

extern "C" JNIEXPORT jint JNICALL
Java_org_torrenter_watcher_RuntimeService_startNode(JNIEnv* env, jclass, jstring root, jstring config, jstring binary, jint port) {
    auto str = [env](jstring s) { const char* p = env->GetStringUTFChars(s, nullptr); std::string out(p); env->ReleaseStringUTFChars(s, p); return out; };
    std::string entry = str(root) + "/server/index.js";
    setenv("HOST", "127.0.0.1", 1);
    setenv("PORT", std::to_string(port).c_str(), 1);
    setenv("TW_CONFIG", str(config).c_str(), 1);
    setenv("TW_TORRSERVER_BINARY", str(binary).c_str(), 1);
    // node::Start requires writable, contiguous argv storage.
    std::vector<char> args(5 + entry.size() + 1);
    std::copy_n("node", 5, args.data());
    std::copy(entry.begin(), entry.end(), args.begin() + 5);
    char* argv[] = { args.data(), args.data() + 5 };
    return node::Start(2, argv);
}
