<?php

/**
 * page_success.php
 *
 * Copyright 2008- Samuli Järvelä
 * Released under GPL License.
 *
 * License: http://www.mollify.org/license.php
 */

include "install/installation_page.php";

function version($ver) {
	return str_replace("_", ".", $ver);
}
?>

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">

<html>
	<?php pageHeader("Mollify Update");?>

	<?php pageBody("Update Complete");?>
	<p>
		Mollify was successfully updated with following updates:
		<ul><?php
$updates = $installer->data("updates");
foreach ($updates as $update) {
	echo "<li>" . $update . "</li>";
}

?></ul>
	</p>
	<?php pageFooter();?>
</html>