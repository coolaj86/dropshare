#!/bin/bash

#
# Installation
#
# sudo wget 'https://raw.github.com/SpotterRF/dropshare/master/clients/dropshare.sh' -O '/usr/local/bin/dropshare'
# sudo chmod a+x '/usr/local/bin/dropshare'
#

STATIC_HOST="https://dropsha.re"
# for API
HOST="https://dropsha.re"

FILE=$1
if [ ! -f "${FILE}" ]
then
  echo "'${FILE}' is not a file"
  echo Usage: dropshare /path/to/file
  exit 1
fi

# works on OSX and Linux
# TODO write in python (available on most *nix?)
FILE_SIZE=`du "${FILE}" | cut -f1`
# from the commandline, only half of these slashes are necessary
FILE_NAME=`basename "${FILE}" | sed -e 's/\\\\/\\\\\\\\/g' -e 's/"/\\\\"/g' -e 's/ /_/g'`
FILE_ONAME=`basename "${FILE}" | sed -e 's/\\\\/\\\\\\\\/g' -e 's/"/\\\\"/g'`
if [ -z "${FILE_PATH}" ]
then
  FILE_PATH=`dirname "${FILE}" | sed 's/\\\\/\\\\\\\\/g' | sed 's/"/\\\\"/g'`
  # cmdline: FILE_PATH=`dirname "${FILE}" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g'`
else
  FILE_PATH=''
fi
FILE_TYPE=`file --brief --mime-type "${FILE}"`
FILE_MTIME=`stat --printf '%Y\n' "${FILE}" 2>/dev/null || stat -f '%m' "${FILE}"`
FILE_MTIME=`date -d "@${FILE_MTIME}" -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -r "${FILE_MTIME}" +"%Y-%m-%dT%H:%M:%SZ"`

#echo '[{
RESULT=`curl --silent "${HOST}/files/new"  -X POST \
  -H "Content-Type: application/json" \
  -d '[{
        "size": '${FILE_SIZE}',
        "lastModifiedDate": "'${FILE_MTIME}'",
        "fileName": "'${FILE_NAME}'",
        "path": "'${FILE_PATH}'",
        "type": "'${FILE_TYPE}'"
      }]'`

# ex: ["p2Oo6f8"]
ID=`echo ${RESULT} | cut -d'"' -f2`

echo "Uploading to '${HOST}/files/${ID}/${FILE_NAME}'"
echo ""

# TODO 
RESPONSE=`curl --silent --progress-bar "${HOST}/files"  -X POST \
  --form ${ID}=@"${FILE}"`
echo ""

# https://dropsha.re/api/files/dx.R6f8/removefriend.php.har
echo "Your file, Sir! (or Ma'am):"
echo ""
echo "${STATIC_HOST}/#${ID}"
echo ""
echo "wget '${HOST}/files/${ID}/${FILE_NAME}'"
echo ""
echo "curl '${HOST}/files/${ID}' -o '${FILE_NAME}'"
echo ""
echo "dropshare-get ${ID} ${FILE_ONAME}"
