#!/usr/bin/env bash
# Exit 1 while a view whose background drawable's alpha is set to 128 draws its red border at another alpha than half on
# the attached Android device, 0 once each draws it at half, 2 when another step fails.
# Needs adb with one Android device attached (ANDROID_SERIAL picks one of several), node, yarn and a JDK.
set -u

package=com.reproducerapp
untouched_label="red border, background alpha untouched"
half_alpha_labels=("red border, background alpha 128" "red left edge, background alpha 128")
log_tag=BorderAlphaReproducer
border_width_dp=8

fail_step() {
    echo "step failed: $1"
    exit 2
}

# The path as the platform's own programs take it: Git Bash's /c/... becomes C:/... for node on Windows.
native_path() {
    if command -v cygpath > /dev/null; then
        cygpath -m "$1"
    else
        printf '%s\n' "$1"
    fi
}

# Sets the named variable to a device property, without the carriage return adb's shell ends it with.
read_device_property() {
    local value
    value="$(adb shell getprop "$2")" || fail_step "adb shell getprop $2: ${value}"
    printf -v "$1" '%s' "${value//$'\r'/}"
}

dump_window() {
    adb shell uiautomator dump /sdcard/elevation-reproducer.xml > /dev/null 2>&1
    adb exec-out cat /sdcard/elevation-reproducer.xml > "$1" 2> /dev/null
    adb shell rm -f /sdcard/elevation-reproducer.xml
}

wait_for_label() {
    local hierarchy=$1 label=$2 attempt
    for ((attempt = 1; attempt <= 30; attempt += 1)); do
        dump_window "${hierarchy}"
        if grep -qF "content-desc=\"${label}\"" "${hierarchy}"; then
            return 0
        fi
        sleep 1
    done
    return 1
}

# Prints "left top right bottom" of the node whose content-desc is the label, from a `uiautomator dump`.
bounds_of() {
    local hierarchy=$1 label=$2 bounds
    bounds="$(sed -nE "s/.*content-desc=\"${label}\"[^>]*bounds=\"\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]\".*/\1 \2 \3 \4/p" \
        "${hierarchy}")"
    [[ -n "${bounds}" ]] || return 1
    echo "${bounds}"
}

screenshot() {
    adb exec-out screencap -p > "$1" 2> /dev/null && [[ -s "$1" ]]
}

# Waits until MainActivity has logged an alpha for each view it sets one on, and prints those lines.
wait_for_alpha_logs() {
    local attempt log
    local -a lines
    for ((attempt = 1; attempt <= 30; attempt += 1)); do
        log="$(adb logcat -d -s "${log_tag}:I" 2> /dev/null)" || log=""
        mapfile -t lines < <(grep -F ".alpha = " <<< "${log}" || true)
        if [[ "${#lines[@]}" -ge "${#half_alpha_labels[@]}" ]]; then
            printf '%s\n' "${lines[@]}" | sed -E "s/^.*${log_tag}[^:]*: /${log_tag}: /"
            return 0
        fi
        sleep 1
    done
    return 1
}

main() {
    local here app shots
    here="$(cd "$(dirname "$0")" && pwd)"
    app="${here}/ReproducerApp"
    shots="${here}/screenshots"
    work="$(mktemp -d)"
    trap 'rm -rf "${work}"' EXIT
    mkdir -p "${shots}"

    local system node_version java_version
    system="$(uname -sm)"
    node_version="$(node --version 2>&1)" || fail_step "node --version: ${node_version}"
    java_version="$(java -version 2>&1)" || fail_step "java -version: ${java_version}"
    echo "${system}, node ${node_version}, ${java_version%%$'\n'*}"

    local device_state
    device_state="$(adb get-state 2>&1)"
    [[ "${device_state}" == "device" ]] || fail_step "adb get-state: ${device_state}"
    local model release sdk abi sizes densities screen density
    read_device_property model ro.product.model
    read_device_property release ro.build.version.release
    read_device_property sdk ro.build.version.sdk
    read_device_property abi ro.product.cpu.abi
    sizes="$(adb shell wm size)" || fail_step "adb shell wm size: ${sizes}"
    sizes="${sizes//$'\r'/}"
    screen="$(sed -nE 's/^Override size: ([0-9]+x[0-9]+)$/\1/p' <<< "${sizes}")"
    [[ -n "${screen}" ]] || screen="$(sed -nE 's/^Physical size: ([0-9]+x[0-9]+)$/\1/p' <<< "${sizes}")"
    densities="$(adb shell wm density)" || fail_step "adb shell wm density: ${densities}"
    densities="${densities//$'\r'/}"
    density="$(sed -nE 's/^Override density: ([0-9]+)$/\1/p' <<< "${densities}")"
    [[ -n "${density}" ]] || density="$(sed -nE 's/^Physical density: ([0-9]+)$/\1/p' <<< "${densities}")"
    [[ -n "${screen}" && -n "${density}" ]] || fail_step "wm size and wm density: ${sizes} ${densities}"
    echo "device: ${model}, Android ${release} (API ${sdk}), ${abi}, ${screen} at ${density} dpi"

    local install_output react_native_version
    install_output="$(cd "${app}" && yarn install --frozen-lockfile --non-interactive 2>&1)" ||
        { printf '%s\n' "${install_output}" | tail -n 20; fail_step "yarn install"; }
    react_native_version="$(cd "${app}" && node -p 'require("react-native/package.json").version' 2>&1)" ||
        fail_step "reading react-native's version: ${react_native_version}"
    echo "react-native ${react_native_version}"

    echo "== ./gradlew :app:assembleRelease -PreactNativeArchitectures=${abi}"
    local build_output
    build_output="$(cd "${app}/android" && ./gradlew --no-daemon --console=plain :app:assembleRelease \
        "-PreactNativeArchitectures=${abi}" 2>&1)" ||
        { printf '%s\n' "${build_output}" | tail -n 40; fail_step "the release build"; }

    local apk install_result
    apk="$(native_path "${app}/android/app/build/outputs/apk/release/app-release.apk")"
    install_result="$(adb install -r "${apk}" 2>&1)" || fail_step "adb install: ${install_result}"
    adb shell am force-stop "${package}"
    adb logcat -c || fail_step "adb logcat -c"
    adb shell am start -W -n "${package}/.MainActivity" > /dev/null || fail_step "starting ${package}"

    local hierarchy="${work}/hierarchy.xml" label view
    wait_for_label "${hierarchy}" "${half_alpha_labels[-1]}" || fail_step "the app showed no \"${half_alpha_labels[-1]}\""
    wait_for_alpha_logs || fail_step "MainActivity logged no background alpha for the views it sets one on"
    sleep 1

    local views=()
    for label in "${untouched_label}" "${half_alpha_labels[@]}"; do
        view="$(bounds_of "${hierarchy}" "${label}")" || fail_step "no bounds for \"${label}\""
        views+=("${label}=${view// /,}")
    done

    local shot="${shots}/background-alpha-128.png"
    screenshot "${shot}" || fail_step "adb exec-out screencap -p"
    echo "screenshot: screenshots/${shot##*/}"

    local read_script shot_file
    read_script="$(native_path "${here}/read-border-alpha.mjs")"
    shot_file="$(native_path "${shot}")"
    node "${read_script}" "${shot_file}" "${screen}" "$((border_width_dp * density / 160))" "${views[@]}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
