#!/usr/bin/env python3
"""Verify a signed V2 -> V2.1 in-place Android update on an owned emulator."""

import argparse
import hashlib
import io
import json
import os
import re
import shutil
import shlex
import subprocess
import sys
import tarfile
import tempfile
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PACKAGE = "com.betbrawl.app"
ACTIVITY = f"{PACKAGE}/.MainActivity"
BASELINE_SHA256 = "dc7778c4746acfba706d872a6a55a5a49dc051ecb465475cc58a64436d3681df"
CERT_SHA256 = "222a2459a560c966ab30ebc7a03d60008a5614692e84e726b7f1568f60caef51"
NAME = "V2UpgradeQA"
AVATAR = "🦊"
APP_DATA = f"/data/user/0/{PACKAGE}"
LOCAL_STORAGE = "app_webview/Default/Local Storage/leveldb"
PREFS = "shared_prefs"


def run(args, *, check=True, capture=True, timeout=60, binary=False):
    output = {"stdout": subprocess.PIPE if capture else None,
              "stderr": subprocess.PIPE if capture else None,
              "text": not binary, "timeout": timeout}
    if not binary:
        output.update({"encoding": "utf-8", "errors": "replace"})
    result = subprocess.run(
        [str(arg) for arg in args],
        **output,
    )
    if check and result.returncode:
        stderr = result.stderr if capture else ""
        stdout = result.stdout if capture else ""
        raise RuntimeError(f"Command failed ({result.returncode}): {args[0]} {args[1:]}\n{stderr or stdout}")
    return result


def adb(args, *, check=True, timeout=60, binary=False):
    return run([OPTIONS.adb, "-s", OPTIONS.serial, *args], check=check, timeout=timeout, binary=binary)


def shell(*args, check=True, timeout=60):
    return adb(["shell", *args], check=check, timeout=timeout).stdout.strip()


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def apk_info(path, aapt, apksigner):
    badging = run([aapt, "dump", "badging", path]).stdout
    match = re.search(r"^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging, re.M)
    if not match:
        raise RuntimeError(f"Could not read package/version from {path}")
    certs = run([*apksigner, "verify", "--print-certs", path]).stdout
    signer_hashes = {value.replace(":", "").lower() for value in
                     re.findall(r"certificate SHA-256 digest:\s*([0-9a-fA-F:]+)", certs, re.I)}
    if len(signer_hashes) != 1:
        raise RuntimeError(f"Could not verify APK signer for {path}")
    return {"package": match.group(1), "versionCode": int(match.group(2)),
            "versionName": match.group(3), "certificateSha256": signer_hashes.pop(),
            "badging": badging}


def require_candidate_metadata(info):
    if re.search(r"^application-debuggable$", info["badging"], re.M):
        raise RuntimeError("Candidate APK is debuggable; a production signed update is required.")
    minimum = re.search(r"^sdkVersion:'(\d+)'$", info["badging"], re.M)
    target = re.search(r"^targetSdkVersion:'(\d+)'$", info["badging"], re.M)
    if not minimum or int(minimum.group(1)) != 24:
        raise RuntimeError("Candidate APK must declare minimum Android API 24.")
    if not target or int(target.group(1)) != 35:
        raise RuntimeError("Candidate APK must target Android API 35.")


def tool_version_key(path):
    match = re.fullmatch(r"([\d.]+)(.*)", path.name)
    numbers = tuple(int(value) for value in match.group(1).strip(".").split(".")) if match else ()
    suffix = match.group(2).lower() if match else path.name.lower()
    return numbers, not suffix, suffix


def android_tools(sdk):
    build_tools = sdk / "build-tools"
    windows = os.name == "nt"
    aapt_name = "aapt.exe" if windows else "aapt"
    candidates = [(directory / aapt_name, directory / "lib" / "apksigner.jar")
                  for directory in build_tools.iterdir()
                  if directory.is_dir() and re.fullmatch(r"\d+(?:\.\d+)*(?:[-+].*)?", directory.name)] if build_tools.is_dir() else []
    candidates = [(aapt, signer) for aapt, signer in candidates if aapt.is_file() and signer.is_file()]
    if not candidates:
        raise RuntimeError(f"No Android build-tools directory with {aapt_name} and lib/apksigner.jar under {build_tools}")
    return max(candidates, key=lambda pair: tool_version_key(pair[0].parent))


def package_state():
    raw = shell("dumpsys", "package", PACKAGE)
    uid = re.search(r"\b(?:userId|appId)=(\d+)", raw)
    version = re.search(r"\bversionCode=(\d+)", raw)
    first = re.search(r"\bfirstInstallTime=([^\r\n]+)", raw)
    if not uid or not version or not first:
        raise RuntimeError("Package Manager did not expose UID, versionCode, and firstInstallTime.")
    return {"uid": int(uid.group(1)), "versionCode": int(version.group(1)), "firstInstallTime": first.group(1).strip()}


def wait_device():
    run([OPTIONS.adb, "-s", OPTIONS.serial, "wait-for-device"], timeout=60)
    deadline = time.time() + 30
    while time.time() < deadline:
        if shell("getprop", "sys.boot_completed", check=False) == "1":
            return
        time.sleep(1)
    raise RuntimeError("Emulator did not finish booting.")


def dump_ui(label):
    remote = f"/sdcard/betbrawl-upgrade-{os.getpid()}.xml"
    adb(["shell", "uiautomator", "dump", remote], timeout=30)
    xml = shell("cat", remote)
    (OPTIONS.evidence / f"{label}.xml").write_text(xml, encoding="utf-8")
    try:
        adb(["shell", "rm", "-f", remote])
    except Exception:
        pass
    return ET.fromstring(xml)


def ui_nodes(root):
    return list(root.iter("node"))


def bounds(node):
    match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
    return tuple(map(int, match.groups())) if match else None


def tap(node, description):
    box = bounds(node)
    if not box or box[2] <= box[0] or box[3] <= box[1]:
        raise RuntimeError(f"UI hierarchy has no usable bounds for {description}.")
    adb(["shell", "input", "tap", str((box[0] + box[2]) // 2), str((box[1] + box[3]) // 2)])


def tap_matching(root, predicate, description):
    node = next((node for node in ui_nodes(root) if predicate(node.attrib)), None)
    if node is None:
        raise RuntimeError(f"Could not find {description} in the UI hierarchy.")
    tap(node, description)


def wait_ui(predicate, description, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        root = dump_ui("ui-current")
        tip = next((n for n in ui_nodes(root) if n.attrib.get("resource-id") == "com.android.systemui:id/ok"
                    and n.attrib.get("text") == "Got it"), None)
        if tip is not None:
            tap(tip, "dismiss Android fullscreen tip")
            time.sleep(1)
            continue
        if predicate(root):
            return root
        time.sleep(1)
    raise RuntimeError(f"Timed out waiting for {description}.")


def seed_identity():
    adb(["shell", "am", "force-stop", PACKAGE], check=False)
    adb(["shell", "am", "start", "-W", "-n", ACTIVITY], timeout=60)
    root = wait_ui(lambda tree: any("HOST NEW GAME" in n.attrib.get("text", "").upper() for n in ui_nodes(tree)), "V2 entry screen")
    tap_matching(root, lambda a: "player-alias" in a.get("resource-id", "") or a.get("class") == "android.widget.EditText", "profile name input")
    time.sleep(1)
    adb(["shell", "input", "keyevent", "123"])
    for _ in range(20):
        adb(["shell", "input", "keyevent", "67"])
    adb(["shell", "input", "text", NAME])
    adb(["shell", "input", "keyevent", "4"])
    root = wait_ui(lambda tree: any(n.attrib.get("text") == NAME for n in ui_nodes(tree)), "seeded profile name")
    tap_matching(root, lambda a: a.get("text") == AVATAR, "fox avatar button")
    root = dump_ui("identity-seeded")
    if sum(n.attrib.get("text") == AVATAR for n in ui_nodes(root)) < 2:
        raise RuntimeError("Selected avatar was not visible in both the profile card and avatar choices.")
    tap_matching(root, lambda a: "HOST NEW GAME" in a.get("text", "").upper(), "Host new game")
    denied_text = {"Don't allow", "Don’t allow", "Not now"}
    root = wait_ui(lambda tree: any("ROOM CODE" in n.attrib.get("text", "").upper() for n in ui_nodes(tree))
                    or any(n.attrib.get("text", "") in denied_text for n in ui_nodes(tree)),
                    "host lobby or notification prompt after profile save", 45)
    if any(n.attrib.get("text", "") in denied_text for n in ui_nodes(root)):
        tap_matching(root, lambda a: a.get("text", "") in denied_text, "dismiss optional notification permission")
        root = wait_ui(lambda tree: any("ROOM CODE" in n.attrib.get("text", "").upper() for n in ui_nodes(tree)), "host lobby after permission prompt", 45)
    # Close only the smoke-created room through the app UI so host state flushes normally.
    adb(["shell", "input", "keyevent", "4"])
    root = wait_ui(lambda tree: any("Close room and leave?" in n.attrib.get("text", "") for n in ui_nodes(tree)), "host leave confirmation")
    tap_matching(root, lambda a: a.get("text") == "Close room and leave", "close smoke room")
    wait_ui(lambda tree: any("HOST NEW GAME" in n.attrib.get("text", "").upper() for n in ui_nodes(tree)), "entry screen after room cleanup")
    adb(["shell", "am", "force-stop", PACKAGE])
    if shell("pidof", PACKAGE, check=False):
        raise RuntimeError("Could not stop the app before taking the baseline data snapshot.")


def snapshot():
    for relative in (LOCAL_STORAGE, PREFS):
        result = adb(["shell", "test", "-d", shlex.quote(f"{APP_DATA}/{relative}")], check=False)
        if result.returncode:
            raise RuntimeError(f"Required app data directory is missing: {relative}")
    command = f"tar -cf - -C {APP_DATA} '{LOCAL_STORAGE}' '{PREFS}'"
    packed = adb(["exec-out", command], timeout=60, binary=True).stdout
    if not packed:
        raise RuntimeError("Device returned an empty app data snapshot.")
    files = {}
    contents = {}
    with tarfile.open(fileobj=io.BytesIO(packed), mode="r:") as tar:
        for member in tar.getmembers():
            if not member.isfile():
                continue
            stream = tar.extractfile(member)
            if stream is None:
                raise RuntimeError(f"Could not read snapshot member {member.name}")
            data = stream.read()
            contents[member.name] = data
            files[member.name] = hashlib.sha256(data).hexdigest()
    if not any(LOCAL_STORAGE in name for name in files) or not any(PREFS in name for name in files):
        raise RuntimeError("Snapshot did not contain both WebView Local Storage and shared preferences files.")
    return {"tarSha256": hashlib.sha256(packed).hexdigest(), "files": files}, contents


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serial", required=True, help="Explicit task-owned emulator serial, e.g. emulator-5580")
    parser.add_argument("--baseline-apk", required=True, type=Path, help="Immutable V2 2.0.0/code3 release APK")
    parser.add_argument("--candidate-apk", required=True, type=Path, help="Signed V2.1 2.1.0/code4 APK")
    parser.add_argument("--evidence-dir", required=True, type=Path)
    parser.add_argument("--adb", default=None)
    parser.add_argument("--sdk", type=Path, default=None)
    return parser.parse_args()


def main():
    global OPTIONS
    OPTIONS = parse_args()
    if not re.fullmatch(r"emulator-\d+", OPTIONS.serial):
        raise RuntimeError("Only an explicitly selected emulator-N serial is accepted; physical device serials are rejected.")
    OPTIONS.evidence = OPTIONS.evidence_dir.resolve()
    OPTIONS.evidence.mkdir(parents=True, exist_ok=True)
    baseline = OPTIONS.baseline_apk.resolve(strict=True)
    candidate = OPTIONS.candidate_apk.resolve(strict=True)
    sdk_value = OPTIONS.sdk or os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if not sdk_value:
        raise RuntimeError("Set ANDROID_HOME or ANDROID_SDK_ROOT, or pass --sdk.")
    sdk = Path(sdk_value).resolve(strict=True)
    aapt, apksigner_jar = android_tools(sdk)
    windows = os.name == "nt"
    executable_suffix = ".exe" if windows else ""
    java_home = os.environ.get("JAVA_HOME")
    java_home_bin = Path(java_home) / "bin" / f"java{executable_suffix}" if java_home else None
    java = str(java_home_bin) if java_home_bin and java_home_bin.is_file() else shutil.which("java")
    if not java:
        raise RuntimeError("Java was not found in JAVA_HOME/bin or PATH.")
    adb_path = Path(OPTIONS.adb) if OPTIONS.adb else sdk / "platform-tools" / f"adb{executable_suffix}"
    if OPTIONS.adb:
        OPTIONS.adb = str(adb_path) if adb_path.exists() else OPTIONS.adb
    elif adb_path.exists():
        OPTIONS.adb = str(adb_path)
    else:
        OPTIONS.adb = shutil.which("adb")
        if not OPTIONS.adb:
            raise RuntimeError(f"Android adb was not found under {sdk / 'platform-tools'} or on PATH.")
    if sha256(baseline) != BASELINE_SHA256:
        raise RuntimeError("Baseline APK SHA-256 does not match the immutable V2 code3 release pin.")
    signer = [java, "-jar", str(apksigner_jar)]
    old = apk_info(baseline, aapt, signer)
    new = apk_info(candidate, aapt, signer)
    old_metadata = {key: old[key] for key in ("package", "versionCode", "versionName", "certificateSha256")}
    new_metadata = {key: new[key] for key in ("package", "versionCode", "versionName", "certificateSha256")}
    if old_metadata != {"package": PACKAGE, "versionCode": 3, "versionName": "2.0.0", "certificateSha256": CERT_SHA256}:
        raise RuntimeError(f"Baseline package/version/signature mismatch: {old_metadata}")
    require_candidate_metadata(new)
    if new_metadata != {"package": PACKAGE, "versionCode": 4, "versionName": "2.1.0", "certificateSha256": CERT_SHA256}:
        raise RuntimeError(f"Candidate must be package {PACKAGE}, version 2.1.0/code4 and pinned signer; got {new_metadata}")
    listed = run([OPTIONS.adb, "devices"], timeout=30).stdout
    if not re.search(rf"^{re.escape(OPTIONS.serial)}\s+device\s*$", listed, re.M):
        raise RuntimeError(f"Selected emulator {OPTIONS.serial} is not online.")
    wait_device()
    if shell("getprop", "ro.kernel.qemu") != "1":
        raise RuntimeError("Selected serial is not a qemu emulator; refusing device mutation.")
    root_result = run([OPTIONS.adb, "-s", OPTIONS.serial, "root"], timeout=30)
    wait_device()
    if shell("id", "-u") != "0":
        raise RuntimeError(f"adb root did not provide root access: {root_result.stdout.strip()}")

    summary = {"result": "RUNNING", "serial": OPTIONS.serial, "package": PACKAGE,
               "baseline": {**old_metadata, "sha256": sha256(baseline)},
               "candidate": {**new_metadata, "sha256": sha256(candidate)}}
    (OPTIONS.evidence / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    installed = shell("pm", "path", PACKAGE, check=False)
    if not installed:
        run([OPTIONS.adb, "-s", OPTIONS.serial, "install", str(baseline)], timeout=120)
    else:
        state = package_state()
        if state["versionCode"] != 3:
            raise RuntimeError(f"Refusing to replace installed app at versionCode {state['versionCode']}; expected V2 code3.")
        base_remote = installed.splitlines()[0].removeprefix("package:")
        with tempfile.TemporaryDirectory() as temp:
            local = Path(temp) / "installed-base.apk"
            run([OPTIONS.adb, "-s", OPTIONS.serial, "pull", base_remote, local], timeout=120)
            existing = apk_info(local, aapt, signer)
            existing_metadata = {key: existing[key] for key in ("package", "versionCode", "versionName", "certificateSha256")}
            if sha256(local) != BASELINE_SHA256 or existing_metadata != old_metadata:
                raise RuntimeError("Installed app is not the exact pinned V2 baseline; refusing to alter it.")

    state_before = package_state()
    if state_before["versionCode"] != 3:
        raise RuntimeError(f"V2 baseline not installed: {state_before}")
    if state_before["uid"] < 0:
        raise RuntimeError("Android returned an invalid package UID.")
    seed_identity()
    before, before_bytes = snapshot()
    summary["beforeUpdate"] = {"uid": state_before["uid"], "firstInstallTime": state_before["firstInstallTime"],
                                "versionCode": state_before["versionCode"], "storage": before}
    (OPTIONS.evidence / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    run([OPTIONS.adb, "-s", OPTIONS.serial, "install", "-r", str(candidate)], timeout=120)
    state_after = package_state()
    summary["afterUpdate"] = state_after
    (OPTIONS.evidence / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    if state_after["versionCode"] != 4 or state_after["uid"] != state_before["uid"] or state_after["firstInstallTime"] != state_before["firstInstallTime"]:
        raise RuntimeError(f"In-place update changed version, UID or firstInstallTime unexpectedly: {state_after}")
    after, after_bytes = snapshot()
    if before_bytes != after_bytes:
        changed = sorted(set(before_bytes) | set(after_bytes))
        changed = [name for name in changed if before_bytes.get(name) != after_bytes.get(name)]
        raise RuntimeError(f"App storage bytes changed during package update: {changed[:20]}")
    summary["afterUpdateBeforeLaunch"] = {"uid": state_after["uid"], "firstInstallTime": state_after["firstInstallTime"],
                                           "versionCode": state_after["versionCode"], "storage": after,
                                           "storageByteIdentical": True}
    (OPTIONS.evidence / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    adb(["shell", "am", "start", "-W", "-n", ACTIVITY], timeout=60)
    tree = wait_ui(lambda root: any(n.attrib.get("text") == NAME for n in ui_nodes(root)), "V2.1 retained profile name")
    avatar_count = sum(n.attrib.get("text") == AVATAR for n in ui_nodes(tree))
    if avatar_count < 2:
        raise RuntimeError("V2.1 UI did not show the retained fox avatar in the profile card and avatar choices.")
    summary["result"] = "PASS"
    summary["candidateUi"] = {"nameVisible": True, "avatarVisibleInProfileAndChoices": True}
    (OPTIONS.evidence / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(f"PASS signed V2 -> V2.1 update/data smoke on {OPTIONS.serial}; evidence: {OPTIONS.evidence}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        if "OPTIONS" in globals() and hasattr(OPTIONS, "evidence"):
            summary_path = OPTIONS.evidence / "summary.json"
            try:
                summary = json.loads(summary_path.read_text(encoding="utf-8")) if summary_path.exists() else {}
                summary["result"] = "FAIL"
                summary["error"] = str(error)
                summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
            except Exception:
                pass
        print(f"FAIL: {error}", file=sys.stderr)
        sys.exit(1)
