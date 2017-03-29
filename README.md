# debounce

```
Usage: debounce [OPTION]
Groups rapid lines of stdin, and produces stdout or executes a command after each group.

  -l, --latency=ARG    how many milliseconds to debounce before emitting output or executing command (default: 2000)
  -b, --bootstrap      trigger an event immediately
  -t, --timestamp      print timestamps instead of the debounced event count
  -e, --exec=ARG       execute a command after every group of events. Events arriving while the command runs are considered a single group.
  -i, --ignore-errors  when the exec option is specified, continue debouncing and do not exit even if the command exits with an error code
  -p, --pipe           when the exec option is specified, pipe my stdout into the command
  -h, --help           display this help
```

Copyright 2017 Evernote Corporation. All rights reserved.

