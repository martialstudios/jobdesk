-- JobDesk.app, DMG edition: everything it needs is inside it.
--
-- tools/build-dmg.sh compiles this into a stay-open applet and puts the
-- launcher (macos/dmg/launch) and the payload in Contents/Resources. The first
-- time it opens (and after a newer JobDesk.dmg), it sets JobDesk up from that
-- payload, showing a progress window; then it works like the Terminal-installed
-- JobDesk.app: while it's in the Dock, JobDesk's local server is running, and
-- quitting it stops the server.
--
-- No properties or globals: an applet saves those back into itself on quit,
-- which would break its code signature.

on launcher()
	return quoted form of (POSIX path of (path to me) & "Contents/Resources/launch")
end launcher

on run
	set place to do shell script launcher() & " where"
	if place is not "ok" then
		display dialog "Please move JobDesk into your Applications folder first." & return & return & "In the JobDesk window, drag the JobDesk icon onto the Applications folder. Then open JobDesk from your Applications folder (or Launchpad)." buttons {"OK"} default button "OK" with title "JobDesk" with icon caution
		quit
		return
	end if
	openApp()
end run

-- Clicking the Dock icon again re-opens the browser tab.
on reopen
	openApp()
end reopen

on openApp()
	try
		if (do shell script launcher() & " needs-setup") is "yes" then setUp()
		do shell script launcher() & " open --from-app"
		hideProgress()
	on error errText number errNum
		hideProgress()
		if errNum is -128 then return
		-- 3: `jobdesk stop` ran while JobDesk was starting. Not a failure.
		if errNum is 3 then
			quit
			return
		end if
		set dialogResult to display dialog "JobDesk couldn't start." & return & return & errText buttons {"Show Log", "OK"} default button "OK" with title "JobDesk" with icon caution
		if button returned of dialogResult is "Show Log" then
			try
				do shell script launcher() & " logs --reveal"
			end try
		end if
		quit
	end try
end openApp

-- First run (or a newer DMG): unpack JobDesk into your home folder. The work
-- runs in the background so this window can show how far along it is.
on setUp()
	set progress total steps to 100
	set progress completed steps to 0
	set progress description to "Setting up JobDesk…"
	set progress additional description to "This only happens the first time. It takes about a minute."
	do shell script launcher() & " setup-start"
	repeat
		delay 0.5
		set s to do shell script launcher() & " setup-status"
		if s starts with "done|" then exit repeat
		if s starts with "failed|" then
			set msg to "JobDesk's setup didn't finish."
			if (length of s) > 7 then set msg to text 8 thru -1 of s
			error msg number 1
		end if
		set bar to offset of "|" in s
		if bar > 1 then
			try
				set progress completed steps to (text 1 thru (bar - 1) of s) as integer
			end try
			if bar < (length of s) then set progress additional description to text (bar + 1) thru -1 of s
		end if
	end repeat
	set progress completed steps to 100
	set progress additional description to "Opening JobDesk…"
end setUp

-- A stay-open applet keeps its progress window up until it's reset.
on hideProgress()
	set progress total steps to 0
	set progress completed steps to 0
	set progress description to ""
	set progress additional description to ""
end hideProgress

-- If the server stops some other way, quit too, so the Dock never shows
-- JobDesk as running when it isn't. This only asks whether the server process
-- exists (no web request), so a busy server is never mistaken for a stopped one.
on idle
	try
		do shell script launcher() & " alive"
	on error
		quit
	end try
	return 30
end idle

-- Stopping is a no-op when the server is already gone.
on quit
	try
		do shell script launcher() & " stop --quiet"
	end try
	continue quit
end quit
